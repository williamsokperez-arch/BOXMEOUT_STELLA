// Treasury distribution repository - tracks bulk treasury payouts (leaderboard, creator rewards).
// This is separate from the per-user WinningsPayout tracked in DistributionRepository.
import {
  Distribution,
  DistributionType,
  DistributionStatus,
  PrismaClient,
} from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class TreasuryDistributionRepository extends BaseRepository<Distribution> {
  constructor(prismaClient?: PrismaClient) {
    super(prismaClient);
  }

  getModelName(): string {
    return 'distribution';
  }

  async createDistribution(data: {
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

  async updateStatus(
    id: string,
    status: DistributionStatus,
    failedReason?: string
  ): Promise<Distribution> {
    return await this.update(id, {
      status,
      completedAt:
        status === DistributionStatus.CONFIRMED ? new Date() : undefined,
      failedReason,
    });
  }

  async findByTxHash(txHash: string): Promise<Distribution | null> {
    return await this.getModel().findFirst({ where: { txHash } });
  }

  async findRecent(limit: number = 20): Promise<Distribution[]> {
    return await this.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
