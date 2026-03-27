import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DistributionRepository } from '../../src/repositories/distribution.repository.js';
import { PayoutStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Minimal Prisma mock — only the methods the repository touches.
// ---------------------------------------------------------------------------
const mockWinningsPayout = {
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
};

const mockTransaction = vi.fn();

const mockPrisma = {
  winningsPayout: mockWinningsPayout,
  $transaction: mockTransaction,
} as any;

// ---------------------------------------------------------------------------

describe('DistributionRepository', () => {
  let repo: DistributionRepository;

  const BASE_PAYOUT = {
    id: 'payout-1',
    userId: 'user-1',
    marketId: 'market-1',
    amount: 100,
    status: PayoutStatus.PENDING,
    txHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    paidAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DistributionRepository(mockPrisma);

    // Default $transaction implementation: run the callback with a tx proxy
    // that delegates back to the same mocks for simplicity.
    mockTransaction.mockImplementation((cb: (tx: any) => Promise<any>) =>
      cb(mockPrisma)
    );
  });

  // -------------------------------------------------------------------------
  // createDistribution
  // -------------------------------------------------------------------------
  describe('createDistribution', () => {
    it('creates a PENDING payout record', async () => {
      mockWinningsPayout.create.mockResolvedValue(BASE_PAYOUT);

      const result = await repo.createDistribution({
        userId: 'user-1',
        marketId: 'market-1',
        amount: 100,
      });

      expect(mockWinningsPayout.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          marketId: 'market-1',
          amount: 100,
          status: PayoutStatus.PENDING,
          txHash: null,
        },
      });
      expect(result.status).toBe(PayoutStatus.PENDING);
    });

    it('forwards an optional txHash on creation', async () => {
      mockWinningsPayout.create.mockResolvedValue({
        ...BASE_PAYOUT,
        txHash: 'tx-abc',
      });

      await repo.createDistribution({
        userId: 'user-1',
        marketId: 'market-1',
        amount: 50,
        txHash: 'tx-abc',
      });

      expect(mockWinningsPayout.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ txHash: 'tx-abc' }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // markPaid — idempotency
  // -------------------------------------------------------------------------
  describe('markPaid', () => {
    it('transitions PENDING → PAID and records txHash + paidAt', async () => {
      const paid = {
        ...BASE_PAYOUT,
        status: PayoutStatus.PAID,
        txHash: 'tx-paid',
        paidAt: new Date(),
      };

      mockWinningsPayout.findUnique.mockResolvedValue(BASE_PAYOUT);
      mockWinningsPayout.update.mockResolvedValue(paid);

      const result = await repo.markPaid('payout-1', 'tx-paid');

      expect(mockWinningsPayout.update).toHaveBeenCalledWith({
        where: { id: 'payout-1' },
        data: expect.objectContaining({
          status: PayoutStatus.PAID,
          txHash: 'tx-paid',
          paidAt: expect.any(Date),
        }),
      });
      expect(result.status).toBe(PayoutStatus.PAID);
    });

    it('is idempotent — calling markPaid twice has no effect on second call', async () => {
      const alreadyPaid = {
        ...BASE_PAYOUT,
        status: PayoutStatus.PAID,
        txHash: 'tx-paid',
        paidAt: new Date(),
      };

      // Both calls to findUnique return an already-PAID record.
      mockWinningsPayout.findUnique.mockResolvedValue(alreadyPaid);

      const first = await repo.markPaid('payout-1', 'tx-paid');
      const second = await repo.markPaid('payout-1', 'tx-paid');

      // update must never be called — the guard short-circuits.
      expect(mockWinningsPayout.update).not.toHaveBeenCalled();
      expect(first.status).toBe(PayoutStatus.PAID);
      expect(second.status).toBe(PayoutStatus.PAID);
    });

    it('throws when the payout record does not exist', async () => {
      mockWinningsPayout.findUnique.mockResolvedValue(null);

      await expect(repo.markPaid('ghost-id', 'tx-x')).rejects.toThrow(
        'WinningsPayout not found: ghost-id'
      );
    });
  });

  // -------------------------------------------------------------------------
  // findByMarket
  // -------------------------------------------------------------------------
  describe('findByMarket', () => {
    it('returns all payouts for a market', async () => {
      const payouts = [
        BASE_PAYOUT,
        { ...BASE_PAYOUT, id: 'payout-2', userId: 'user-2' },
      ];
      mockWinningsPayout.findMany.mockResolvedValue(payouts);

      const result = await repo.findByMarket('market-1');

      expect(mockWinningsPayout.findMany).toHaveBeenCalledWith({
        where: { marketId: 'market-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // findByUser
  // -------------------------------------------------------------------------
  describe('findByUser', () => {
    it('returns all payouts for a user', async () => {
      mockWinningsPayout.findMany.mockResolvedValue([BASE_PAYOUT]);

      const result = await repo.findByUser('user-1');

      expect(mockWinningsPayout.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Integration scenario: create → markPaid → verify status
  // -------------------------------------------------------------------------
  describe('integration: create → markPaid → verify', () => {
    it('full lifecycle produces a PAID record', async () => {
      // Step 1 — create
      mockWinningsPayout.create.mockResolvedValue(BASE_PAYOUT);
      const created = await repo.createDistribution({
        userId: 'user-1',
        marketId: 'market-1',
        amount: 200,
      });
      expect(created.status).toBe(PayoutStatus.PENDING);

      // Step 2 — mark paid
      const paidRecord = {
        ...BASE_PAYOUT,
        status: PayoutStatus.PAID,
        txHash: 'tx-final',
        paidAt: new Date(),
      };
      mockWinningsPayout.findUnique.mockResolvedValue(BASE_PAYOUT);
      mockWinningsPayout.update.mockResolvedValue(paidRecord);

      const paid = await repo.markPaid(created.id, 'tx-final');
      expect(paid.status).toBe(PayoutStatus.PAID);
      expect(paid.txHash).toBe('tx-final');
      expect(paid.paidAt).toBeInstanceOf(Date);

      // Step 3 — verify idempotency on a second markPaid call
      mockWinningsPayout.findUnique.mockResolvedValue(paidRecord);
      mockWinningsPayout.update.mockClear();

      const idempotentResult = await repo.markPaid(created.id, 'tx-final');
      expect(mockWinningsPayout.update).not.toHaveBeenCalled();
      expect(idempotentResult.status).toBe(PayoutStatus.PAID);
    });
  });
});
