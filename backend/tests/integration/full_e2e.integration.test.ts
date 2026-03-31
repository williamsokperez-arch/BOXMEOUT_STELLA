import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaClient, MarketStatus, NotificationType } from '@prisma/client';

// Mock blockchains + Stellar network calls to keep tests local and deterministic
vi.mock('../../src/services/blockchain/factory.js', () => ({
  factoryService: {
    createMarket: vi.fn(async (params: any) => ({
      marketId: `mock-contract-${Date.now()}`,
      txHash: `mock-factory-tx-${Date.now()}`,
      contractAddress: `mock-contract-address-${Date.now()}`,
    })),
    deactivateMarket: vi.fn(async () => ({ txHash: `mock-deactivate-tx-${Date.now()}` })),
  },
}));

vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    buyShares: vi.fn(async () => ({
      sharesReceived: 50,
      pricePerUnit: 1.0,
      totalCost: 50,
      feeAmount: 0.5,
      txHash: `mock-buy-tx-${Date.now()}`,
    })),
    sellShares: vi.fn(async () => ({
      payout: 25,
      pricePerUnit: 0.5,
      feeAmount: 0.25,
      txHash: `mock-sell-tx-${Date.now()}`,
    })),
    getOdds: vi.fn(async () => ({
      yesOdds: 0.6,
      noOdds: 0.4,
      yesPercentage: 60,
      noPercentage: 40,
      yesLiquidity: 500,
      noLiquidity: 500,
      totalLiquidity: 1000,
    })),
    addLiquidity: vi.fn(async () => ({
      lpTokensMinted: BigInt(500),
      txHash: `mock-add-liquidity-${Date.now()}`,
    })),
    removeLiquidity: vi.fn(async () => ({
      yesAmount: BigInt(250),
      noAmount: BigInt(250),
      totalUsdcReturned: BigInt(500),
      txHash: `mock-remove-liquidity-${Date.now()}`,
    })),
    buildBuySharesTx: vi.fn(async () => 'mock-build-buy-xdr'),
    buildSellSharesTx: vi.fn(async () => 'mock-build-sell-xdr'),
    submitSignedTx: vi.fn(async () => ({ txHash: 'mock-submit-tx', status: 'SUCCESS' })),
    createPool: vi.fn(async () => ({
      reserves: { yes: BigInt(500000000), no: BigInt(500000000) },
      txHash: `mock-pool-tx-${Date.now()}`,
      odds: { yes: 0.5, no: 0.5 },
    })),
  },
}));

vi.mock('../../src/services/blockchain/market.js', () => ({
  marketBlockchainService: {
    commitPrediction: vi.fn(async () => ({ txHash: `mock-commit-tx-${Date.now()}` })),
    revealPrediction: vi.fn(async () => ({ txHash: `mock-reveal-tx-${Date.now()}` })),
  },
}));

vi.mock('../../src/services/stellar.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/stellar.service.js')>('../../src/services/stellar.service.js');
  return {
    ...actual,
    stellarService: {
      ...actual.stellarService,
      sendUsdc: vi.fn(async () => ({ txHash: `mock-withdraw-tx-${Date.now()}` })),
    },
  };
});

// Bring in modules now that mocks are set up
import { authService } from '../../src/services/auth.service.js';
import { sessionService } from '../../src/services/session.service.js';
import { MarketService } from '../../src/services/market.service.js';
import { tradingService } from '../../src/services/trading.service.js';
import { PredictionService } from '../../src/services/prediction.service.js';
import { disputeService } from '../../src/services/dispute.service.js';
import { walletService } from '../../src/services/wallet.service.js';
import { notificationService } from '../../src/services/notification.service.js';
import { leaderboardService } from '../../src/services/leaderboard.service.js';
import { verifyRefreshToken } from '../../src/utils/jwt.js';
import * as realtime from '../../src/websocket/realtime.js';

describe('Full end-to-end integration test (real DB + mocked blockchain)', () => {
  let prisma: PrismaClient;
  let accountId: string;
  let marketId: string;
  let predictionId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    if (accountId) {
      await prisma.trade.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.prediction.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.share.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.dispute.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.leaderboard.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.categoryLeaderboard.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.transaction.deleteMany({ where: { userId: accountId } }).catch(() => {});
      await prisma.market.deleteMany({ where: { creatorId: accountId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: accountId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('should execute auth, market, trading, dispute, prediction, notification, wallet, leaderboard flows', async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();

    // Auth flow: challenge, login, refresh, logout
    const challenge = await authService.generateChallenge(publicKey);
    expect(challenge).toHaveProperty('nonce');
    expect(challenge).toHaveProperty('message');

    const signature = keypair
      .sign(Buffer.from(challenge.message, 'utf-8'))
      .toString('base64');

    const loginResponse = await authService.login({
      publicKey,
      nonce: challenge.nonce,
      signature,
    });

    expect(loginResponse.accessToken).toBeTruthy();
    expect(loginResponse.refreshToken).toBeTruthy();
    expect(loginResponse.user).toHaveProperty('id');

    accountId = loginResponse.user.id;

    const refreshResponse = await authService.refresh(loginResponse.refreshToken);
    expect(refreshResponse.accessToken).toBeTruthy();
    expect(refreshResponse.refreshToken).toBeTruthy();
    expect(refreshResponse.refreshToken).not.toBe(loginResponse.refreshToken);

    const refreshPayload = verifyRefreshToken(refreshResponse.refreshToken);
    await authService.logout(refreshResponse.refreshToken);

    const sessionData = await sessionService.getSession(refreshPayload.tokenId);
    expect(sessionData).toBeNull();

    // Market flow: create, list, get, close, resolve
    const marketService = new MarketService();

    const marketResponse = await marketService.createMarket({
      title: 'End-to-end test market',
      description: 'Test market created in full e2e integration test',
      category: 'SPORTS',
      creatorId: accountId,
      creatorPublicKey: publicKey,
      outcomeA: 'No',
      outcomeB: 'Yes',
      closingAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(marketResponse).toHaveProperty('id');
    expect(marketResponse.status).toBe(MarketStatus.OPEN);
    marketId = marketResponse.id;

    const markets = await marketService.listMarkets({ status: MarketStatus.OPEN });
    expect(markets.some((m: any) => m.id === marketId)).toBe(true);

    const marketDetails = await marketService.getMarketDetails(marketId);
    expect(marketDetails).toHaveProperty('id', marketId);

    // Prediction flow: predict -> close -> resolve -> settled
    const predictionService = new PredictionService();

    const prediction = await predictionService.commitPrediction(
      accountId,
      marketId,
      1,
      10
    );

    expect(prediction).toHaveProperty('id');
    expect(prediction.status).toBe('COMMITTED');
    predictionId = prediction.id;

    // Wallet deposit flow (needs walletAddress to be present on user)
    const depositResult = await walletService.confirmDeposit({
      userId: accountId,
      txHash: 'mock-deposit-20',
    });

    expect(depositResult.amountDeposited).toBe(20);

    // Trading flow: buy shares, check position through share table, sell shares, check balance
    const userBeforeBuy = await prisma.user.findUnique({ where: { id: accountId } });
    expect(userBeforeBuy).toBeTruthy();

    const buyResult = await tradingService.buyShares({
      userId: accountId,
      marketId,
      outcome: 1,
      amount: 20,
      minShares: 18,
    });

    expect(buyResult.sharesBought).toBe(50);

    const shareAfterBuy = await prisma.share.findFirst({
      where: { userId: accountId, marketId, outcome: 1 },
    });
    expect(shareAfterBuy).toBeTruthy();
    expect(Number(shareAfterBuy?.quantity)).toBe(50);

    const sellResult = await tradingService.sellShares({
      userId: accountId,
      marketId,
      outcome: 1,
      shares: 25,
      minPayout: 20,
    });

    expect(sellResult.payout).toBe(25);

    const shareAfterSell = await prisma.share.findFirst({
      where: { userId: accountId, marketId, outcome: 1 },
    });
    expect(shareAfterSell).toBeTruthy();
    expect(Number(shareAfterSell?.quantity)).toBe(25);

    const balanceAfterSell = await prisma.user.findUnique({ where: { id: accountId } });
    expect(Number(balanceAfterSell?.usdcBalance)).toBeGreaterThan(0);

    // Close + resolve market
    await marketService.closeMarket(marketId);
    const closedMarket = await prisma.market.findUnique({ where: { id: marketId } });
    expect(closedMarket?.status).toBe(MarketStatus.CLOSED);

    await marketService.resolveMarket(marketId, 1, 'unit-test-resolution');
    const resolvedMarket = await prisma.market.findUnique({ where: { id: marketId } });
    expect(resolvedMarket?.status).toBe(MarketStatus.RESOLVED);
    expect(resolvedMarket?.winningOutcome).toBe(1);

    const settledPrediction = await prisma.prediction.findUnique({ where: { id: predictionId } });
    expect(settledPrediction?.status).toBe('SETTLED');
    expect(settledPrediction?.isWinner).toBe(true);

    // Dispute flow: market resolved -> submit dispute -> admin resolves (uphold by resetting to 0)
    const dispute = await disputeService.submitDispute({
      marketId,
      userId: accountId,
      reason: 'Resolution seems incorrect',
      evidenceUrl: 'https://example.com/issue',
    });

    expect(dispute.status).toBe('OPEN');

    const resolvedDispute = await disputeService.resolveDispute(dispute.id, 'RESOLVE_NEW_OUTCOME', {
      resolution: 'Admin upheld dispute and set new outcome',
      newWinningOutcome: 0,
    });

    expect(resolvedDispute.status).toBe('RESOLVED');

    const recheckedMarket = await prisma.market.findUnique({ where: { id: marketId } });
    expect(recheckedMarket?.winningOutcome).toBe(0);

    // Notification flow: call notify and verify pushNotificationToUser gets invoked
    const pushSpy = vi.spyOn(realtime, 'pushNotificationToUser').mockImplementation(() => {
      // no-op for this test
    });

    const marketFinal = await prisma.market.findUnique({ where: { id: marketId } });
    await notificationService.notifyMarketResolution(
      accountId,
      marketFinal?.title ?? 'Unknown market',
      (marketFinal?.winningOutcome === 1 ? 'YES' : 'NO')
    );

    expect(pushSpy).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({
        id: expect.any(String),
        type: NotificationType.MARKET_RESOLVED,
      })
    );

    const storedNotification = await prisma.notification.findFirst({ where: { userId: accountId } });
    expect(storedNotification).toBeTruthy();
    expect(storedNotification?.type).toBe(NotificationType.MARKET_RESOLVED);

    pushSpy.mockRestore();

    // Wallet withdraw flow
    const balanceBeforeWithdraw = Number((await prisma.user.findUnique({ where: { id: accountId } }))?.usdcBalance || 0);
    const withdrawResult = await walletService.withdraw({ userId: accountId, amount: 5 });
    expect(withdrawResult.amountWithdrawn).toBe(5);

    const balanceAfterWithdraw = Number((await prisma.user.findUnique({ where: { id: accountId } }))?.usdcBalance || 0);
    expect(balanceAfterWithdraw).toBeCloseTo(balanceBeforeWithdraw - 5, 3);

    // Leaderboard flow: trade/prediction settlement should have created leaderboard entry
    const globalLeaderboard = await leaderboardService.getGlobalLeaderboard(10, 0);
    expect(globalLeaderboard.some((entry) => entry.user?.id === accountId || entry.username === loginResponse.user.username)).toBe(true);

    const leaderboardRow = await prisma.leaderboard.findUnique({ where: { userId: accountId } });
    expect(leaderboardRow).toBeTruthy();
    expect(Number(leaderboardRow?.allTimePnl)).toBeGreaterThanOrEqual(0);
  }, 120000);
});
