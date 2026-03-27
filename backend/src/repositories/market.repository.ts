// Market repository - data access layer for markets
import { Market, MarketStatus, MarketCategory } from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';

export class MarketRepository extends BaseRepository<Market> {
  getModelName(): string {
    return 'market';
  }

  async findByContractAddress(contractAddress: string): Promise<Market | null> {
    try {
      return await this.prisma.market.findUnique({ where: { contractAddress } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async addAttestation(marketId: string, oracleId: string, outcome: number, txHash: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const attestation = await tx.attestation.create({
          data: { marketId, oracleId, outcome, txHash },
        });
        const market = await tx.market.update({
          where: { id: marketId },
          data: { attestationCount: { increment: 1 } },
        });
        return { attestation, market };
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async hasAttested(marketId: string, oracleId: string): Promise<boolean> {
    try {
      const record = await this.prisma.attestation.findUnique({
        where: { marketId_oracleId: { marketId, oracleId } },
      });
      return !!record;
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async createMarket(data: {
    contractAddress: string;
    title: string;
    description: string;
    category: MarketCategory;
    creatorId: string;
    outcomeA: string;
    outcomeB: string;
    closingAt: Date;
  }): Promise<Market> {
    try {
      return await this.prisma.market.create({
        data,
        include: {
          creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findActiveMarkets(options?: {
    category?: MarketCategory;
    skip?: number;
    take?: number;
  }): Promise<Market[]> {
    try {
      return await this.prisma.market.findMany({
        where: {
          status: MarketStatus.OPEN,
          closingAt: { gt: new Date() },
          ...(options?.category && { category: options.category }),
        },
        orderBy: { closingAt: 'asc' },
        skip: options?.skip,
        take: options?.take || 20,
        include: {
          creator: { select: { id: true, username: true, displayName: true } },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findMarketsByCreator(creatorId: string): Promise<Market[]> {
    try {
      return await this.prisma.market.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateMarketStatus(
    marketId: string,
    status: MarketStatus,
    additionalData?: {
      closedAt?: Date;
      resolvedAt?: Date;
      winningOutcome?: number;
      resolutionSource?: string;
    }
  ): Promise<Market> {
    try {
      return await this.prisma.market.update({
        where: { id: marketId },
        data: { status, ...additionalData },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateMarketVolume(
    marketId: string,
    volumeChange: number,
    incrementParticipants: boolean = false
  ): Promise<Market> {
    try {
      return await this.prisma.market.update({
        where: { id: marketId },
        data: {
          totalVolume: { increment: volumeChange },
          ...(incrementParticipants && { participantCount: { increment: 1 } }),
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateLiquidity(marketId: string, yesLiquidity: number, noLiquidity: number): Promise<Market> {
    try {
      return await this.prisma.market.update({
        where: { id: marketId },
        data: { yesLiquidity, noLiquidity },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async setPoolTxHash(marketId: string, txHash: string): Promise<Market> {
    try {
      return await this.prisma.market.update({
        where: { id: marketId },
        data: { poolTxHash: txHash },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async addFeesCollected(marketId: string, feeAmount: number): Promise<Market> {
    try {
      return await this.prisma.market.update({
        where: { id: marketId },
        data: { feesCollected: { increment: feeAmount } },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getTrendingMarkets(limit: number = 10): Promise<Market[]> {
    try {
      return await this.prisma.market.findMany({
        where: { status: MarketStatus.OPEN, closingAt: { gt: new Date() } },
        orderBy: [{ totalVolume: 'desc' }, { participantCount: 'desc' }],
        take: limit,
        include: {
          creator: { select: { id: true, username: true, displayName: true } },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getMarketsByCategory(category: MarketCategory, skip?: number, take?: number): Promise<Market[]> {
    try {
      return await this.prisma.market.findMany({
        where: { category, status: MarketStatus.OPEN },
        orderBy: { closingAt: 'asc' },
        skip,
        take: take || 20,
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getClosedMarketsAwaitingResolution(): Promise<Market[]> {
    try {
      return await this.prisma.market.findMany({
        where: { status: MarketStatus.CLOSED },
        orderBy: { closedAt: 'asc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getClosingMarkets(withinHours: number = 24): Promise<Market[]> {
    try {
      const closingTime = new Date();
      closingTime.setHours(closingTime.getHours() + withinHours);
      return await this.prisma.market.findMany({
        where: {
          status: MarketStatus.OPEN,
          closingAt: { gte: new Date(), lte: closingTime },
        },
        orderBy: { closingAt: 'asc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getMarketStatistics() {
    try {
      const [totalMarkets, activeMarkets, totalVolume, avgParticipants] = await Promise.all([
        this.prisma.market.count(),
        this.prisma.market.count({ where: { status: MarketStatus.OPEN } }),
        this.prisma.market.aggregate({ _sum: { totalVolume: true } }),
        this.prisma.market.aggregate({ _avg: { participantCount: true } }),
      ]);
      return {
        totalMarkets,
        activeMarkets,
        totalVolume: totalVolume._sum.totalVolume || 0,
        avgParticipants: avgParticipants._avg.participantCount || 0,
      };
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
