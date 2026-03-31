// Distribution repository - tracks per-user winnings payouts for resolved markets.
// Auditable and idempotent: markPaid is a no-op if the record is already PAID.
import { WinningsPayout, PayoutStatus, PrismaClient } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class DistributionRepository extends BaseRepository<WinningsPayout> {
import { BaseRepository, toRepositoryError } from './base.repository.js';
import {
  Distribution,
  DistributionType,
  DistributionStatus,
  WinningsPayout,
  PayoutStatus,
  PrismaClient,
} from '@prisma/client';

export class DistributionRepository extends BaseRepository<Distribution> {
  constructor(prismaClient?: PrismaClient) {
    super(prismaClient);
  }

  getModelName(): string {
    return 'distribution';
  }

  // --- WinningsPayout methods (used by tests and treasury service) ---

  async createDistribution(data: {
    userId: string;
    marketId: string;
    amount: number;
    txHash?: string;
  }): Promise<WinningsPayout> {
    return await this.prisma.winningsPayout.create({
      data: {
        userId: data.userId,
        marketId: data.marketId,
        amount: data.amount,
        status: PayoutStatus.PENDING,
        txHash: data.txHash ?? null,
      },
    });
  }

  async markPaid(id: string, txHash: string): Promise<WinningsPayout> {
    return await this.prisma.$transaction(async (tx) => {
      const payout = await tx.winningsPayout.findUnique({ where: { id } });
      if (!payout) throw new Error(`WinningsPayout not found: ${id}`);
      if (payout.status === PayoutStatus.PAID) return payout;
      return await tx.winningsPayout.update({
        where: { id },
        data: { status: PayoutStatus.PAID, txHash, paidAt: new Date() },
      });
    });
  }

  async markFailed(id: string): Promise<WinningsPayout> {
    return await this.prisma.winningsPayout.update({
      where: { id },
      data: { status: PayoutStatus.FAILED },
    });
  }

  /** All payout records for a given market, oldest first. */
  async findByMarket(marketId: string): Promise<WinningsPayout[]> {
    return await this.prisma.winningsPayout.findMany({
      where: { marketId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findByUser(userId: string): Promise<WinningsPayout[]> {
    return await this.prisma.winningsPayout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUserAndMarket(
    userId: string,
    marketId: string
  ): Promise<WinningsPayout | null> {
    return await this.prisma.winningsPayout.findUnique({
      where: { userId_marketId: { userId, marketId } },
    });
  }

  // --- Distribution (treasury bulk payout) helpers ---

  async createTreasuryDistribution(data: {
    distributionType: DistributionType;
    totalAmount: number;
    recipientCount: number;
    txHash: string;
    initiatedBy: string;
    metadata?: any;
  }): Promise<Distribution> {
    return await this.create({
      distributionType: data.distributionType,
      totalAmount: data.totalAmount,
      recipientCount: data.recipientCount,
      txHash: data.txHash,
      initiatedBy: data.initiatedBy,
      status: DistributionStatus.PENDING,
      metadata: data.metadata,
    });
  }

  async updateDistributionStatus(
    id: string,
    status: DistributionStatus,
    failedReason?: string
  ): Promise<Distribution> {
    return await this.update(id, {
      status,
      completedAt: status === DistributionStatus.CONFIRMED ? new Date() : undefined,
      failedReason,
    });
  }

  async findDistributionByTxHash(txHash: string): Promise<Distribution | null> {
    try {
      return await this.getModel().findFirst({ where: { txHash } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findRecentDistributions(limit: number = 20): Promise<Distribution[]> {
    return await this.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
