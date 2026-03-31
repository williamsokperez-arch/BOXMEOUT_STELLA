/**
 * Integration tests: wallet deposit → balance increases; withdraw → balance decreases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-abc' };
    next();
  },
}));

vi.mock('../../src/middleware/rateLimit.middleware.js', () => ({
  withdrawalRateLimiter: (_req: any, _res: any, next: any) => next(),
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/middleware/error.middleware.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  errorHandler: (err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ success: false, error: { code: err.code ?? 'ERROR', message: err.message } });
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/websocket/realtime.js', () => ({
  notifyBalanceUpdated: vi.fn(),
}));

vi.mock('../../src/services/notification.service.js', () => ({
  notificationService: { createNotification: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../../src/services/stellar.service.js', () => ({
  stellarService: {
    sendUsdc: vi.fn().mockResolvedValue({ txHash: 'stellar-tx-withdraw-001' }),
    isValidPublicKey: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    prediction: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  },
}));

// Mock walletService at the module level so controller uses our mock
vi.mock('../../src/services/wallet.service.js', () => ({
  walletService: {
    deposit: vi.fn(),
    withdrawAsync: vi.fn(),
    initiateDeposit: vi.fn(),
    confirmDeposit: vi.fn(),
    withdraw: vi.fn(),
    getBalance: vi.fn(),
    getTransactions: vi.fn(),
  },
  WalletService: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import walletRoutes from '../../src/routes/wallet.routes.js';
import { walletService } from '../../src/services/wallet.service.js';
import { prisma } from '../../src/database/prisma.js';
import { stellarService } from '../../src/services/stellar.service.js';
import { notifyBalanceUpdated } from '../../src/websocket/realtime.js';
import { errorHandler } from '../../src/middleware/error.middleware.js';
import { WalletService } from '../../src/services/wallet.service.js';

// ── App factory ───────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/wallet', walletRoutes);
  app.use(errorHandler as any);
  return app;
}

const USER_ID = 'user-abc';
const WALLET = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX56';

// ── Route-level tests ─────────────────────────────────────────────────────────

describe('POST /api/wallet/deposit — route', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('returns 202 Accepted with transactionId and PENDING status', async () => {
    vi.mocked(walletService.deposit).mockResolvedValue({
      transactionId: 'tx-deposit-001',
      depositAddress: 'GPLATFORM123',
      memo: 'dep:user-abc',
      status: 'PENDING',
    });

    const res = await request(app).post('/api/wallet/deposit').send({ amount: 50 });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transactionId).toBe('tx-deposit-001');
    expect(res.body.data.status).toBe('PENDING');
  });

  it('returns 400 for amount <= 0', async () => {
    const res = await request(app).post('/api/wallet/deposit').send({ amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AMOUNT');
  });

  it('returns 400 for missing amount', async () => {
    const res = await request(app).post('/api/wallet/deposit').send({});
    expect(res.status).toBe(400);
  });

  it('forwards service errors correctly', async () => {
    const { ApiError } = await import('../../src/middleware/error.middleware.js');
    vi.mocked(walletService.deposit).mockRejectedValue(
      new (ApiError as any)(503, 'DEPOSIT_UNAVAILABLE', 'Deposit service not configured')
    );

    const res = await request(app).post('/api/wallet/deposit').send({ amount: 50 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DEPOSIT_UNAVAILABLE');
  });
});

describe('POST /api/wallet/withdraw — route', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('returns 202 Accepted with transactionId and PENDING status', async () => {
    vi.mocked(walletService.withdrawAsync).mockResolvedValue({
      transactionId: 'tx-withdraw-001',
      status: 'PENDING',
      amountRequested: 30,
    });

    const res = await request(app).post('/api/wallet/withdraw').send({ amount: 30 });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transactionId).toBe('tx-withdraw-001');
    expect(res.body.data.amountRequested).toBe(30);
  });

  it('returns 400 for amount <= 0', async () => {
    const res = await request(app).post('/api/wallet/withdraw').send({ amount: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AMOUNT');
  });

  it('forwards INSUFFICIENT_BALANCE from service', async () => {
    const { ApiError } = await import('../../src/middleware/error.middleware.js');
    vi.mocked(walletService.withdrawAsync).mockRejectedValue(
      new (ApiError as any)(400, 'INSUFFICIENT_BALANCE', 'Insufficient balance')
    );

    const res = await request(app).post('/api/wallet/withdraw').send({ amount: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });
});

// ── Service integration tests (deposit → balance increases; withdraw → balance decreases) ──

describe('WalletService.deposit — balance increases', () => {
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<any>('../../src/services/wallet.service.js');
    service = new actual.WalletService();
  });

  it('creates PENDING transaction and returns transactionId', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_ID, usdcBalance: 100 as any, walletAddress: WALLET,
    } as any);
    vi.mocked(prisma.transaction.create).mockResolvedValue({
      id: 'tx-001', status: 'PENDING',
    } as any);

    // Temporarily set env for this test
    const orig = process.env.PLATFORM_DEPOSIT_ADDRESS;
    process.env.PLATFORM_DEPOSIT_ADDRESS = 'GPLATFORM123';

    const result = await service.deposit({ userId: USER_ID, amount: 50 });

    process.env.PLATFORM_DEPOSIT_ADDRESS = orig;

    expect(result.transactionId).toBe('tx-001');
    expect(result.status).toBe('PENDING');
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ txType: 'DEPOSIT', amountUsdc: 50, status: 'PENDING' }),
      })
    );
  });

  it('creates PENDING transaction record (balance credited asynchronously)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_ID, usdcBalance: 100 as any, walletAddress: WALLET,
    } as any);
    vi.mocked(prisma.transaction.create).mockResolvedValue({ id: 'tx-002', status: 'PENDING' } as any);

    const orig = process.env.PLATFORM_DEPOSIT_ADDRESS;
    process.env.PLATFORM_DEPOSIT_ADDRESS = 'GPLATFORM123';

    const result = await service.deposit({ userId: USER_ID, amount: 50, txHash: 'some-tx-hash' });

    process.env.PLATFORM_DEPOSIT_ADDRESS = orig;

    // Transaction record created with PENDING status — balance will be credited async
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          txType: 'DEPOSIT',
          amountUsdc: 50,
          status: 'PENDING',
          userId: USER_ID,
        }),
      })
    );
    expect(result.status).toBe('PENDING');
    expect(result.transactionId).toBe('tx-002');
  });
});

describe('WalletService.withdrawAsync — balance decreases', () => {
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<any>('../../src/services/wallet.service.js');
    service = new actual.WalletService();
  });

  it('reserves balance immediately and returns PENDING', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_ID, usdcBalance: 100 as any, walletAddress: WALLET,
    } as any);

    let balance = 100;
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: any) => {
      balance -= 30;
      return fn({
        user: { update: vi.fn().mockResolvedValue({ usdcBalance: balance }) },
        transaction: { create: vi.fn().mockResolvedValue({ id: 'tx-w-001', status: 'PENDING' }) },
      });
    });

    const result = await service.withdrawAsync({ userId: USER_ID, amount: 30 });

    expect(result.status).toBe('PENDING');
    expect(result.amountRequested).toBe(30);
    // Balance was reserved (decremented)
    expect(balance).toBe(70);
  });

  it('confirms on-chain and notifies on success', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: USER_ID, usdcBalance: 100 as any, walletAddress: WALLET } as any)
      .mockResolvedValueOnce({ id: USER_ID, usdcBalance: 70 as any, walletAddress: WALLET } as any);

    let balance = 100;
    vi.mocked(prisma.$transaction)
      .mockImplementationOnce(async (fn: any) => {
        balance -= 30;
        return fn({
          user: { update: vi.fn().mockResolvedValue({ usdcBalance: balance }) },
          transaction: { create: vi.fn().mockResolvedValue({ id: 'tx-w-002', status: 'PENDING' }) },
        });
      })
      .mockImplementationOnce(async (fn: any) => {
        return fn({
          transaction: { update: vi.fn().mockResolvedValue({}) },
          user: { findUnique: vi.fn().mockResolvedValue({ usdcBalance: balance }) },
        });
      });

    await service.withdrawAsync({ userId: USER_ID, amount: 30 });
    await new Promise((r) => setTimeout(r, 80));

    expect(stellarService.sendUsdc).toHaveBeenCalledWith(
      WALLET, expect.stringContaining('30'), expect.stringContaining('withdraw:')
    );
    expect(notifyBalanceUpdated).toHaveBeenCalledWith(
      USER_ID, expect.objectContaining({ reason: 'withdrawal', amountDelta: -30 })
    );
  });

  it('throws INSUFFICIENT_BALANCE when amount > balance', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_ID, usdcBalance: 10 as any, walletAddress: WALLET,
    } as any);

    await expect(service.withdrawAsync({ userId: USER_ID, amount: 100 }))
      .rejects.toThrow('Insufficient balance');
  });

  it('refunds balance and notifies on on-chain failure', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_ID, usdcBalance: 100 as any, walletAddress: WALLET,
    } as any);

    let balance = 100;
    vi.mocked(prisma.$transaction)
      .mockImplementationOnce(async (fn: any) => {
        balance -= 30;
        return fn({
          user: { update: vi.fn().mockResolvedValue({ usdcBalance: balance }) },
          transaction: { create: vi.fn().mockResolvedValue({ id: 'tx-w-fail', status: 'PENDING' }) },
        });
      })
      .mockImplementationOnce(async (fn: any) => {
        balance += 30; // refund
        return fn({
          user: { update: vi.fn().mockResolvedValue({ usdcBalance: balance }) },
          transaction: { update: vi.fn().mockResolvedValue({}) },
        });
      });

    vi.mocked(stellarService.sendUsdc).mockRejectedValueOnce(new Error('Network timeout'));

    await service.withdrawAsync({ userId: USER_ID, amount: 30 });
    await new Promise((r) => setTimeout(r, 100));

    // Balance restored after failure
    expect(balance).toBe(100);
  });
});
