// Trade repository - data access layer for trades
import { Trade, TradeType, TradeStatus } from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';

export class TradeRepository extends BaseRepository<Trade> {
  getModelName(): string {
    return 'trade';
  }

  async createTrade(data: {
    userId: string;
    marketId: string;
    tradeType: TradeType;
    outcome?: number;
    quantity: number;
    pricePerUnit: number;
    totalAmount: number;
    feeAmount: number;
    txHash: string;
  }): Promise<Trade> {
    try {
      return await this.prisma.trade.create({ data: { ...data, status: TradeStatus.PENDING } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async confirmTrade(tradeId: string): Promise<Trade> {
    try {
      return await this.prisma.trade.update({
        where: { id: tradeId },
        data: { status: TradeStatus.CONFIRMED, confirmedAt: new Date() },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async failTrade(tradeId: string): Promise<Trade> {
    try {
      return await this.prisma.trade.update({
        where: { id: tradeId },
        data: { status: TradeStatus.FAILED },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findByTxHash(txHash: string): Promise<Trade | null> {
    try {
      return await this.prisma.trade.findFirst({ where: { txHash } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findUserTrades(
    userId: string,
    options?: { tradeType?: TradeType; status?: TradeStatus; skip?: number; take?: number }
  ): Promise<Trade[]> {
    try {
      return await this.prisma.trade.findMany({
        where: {
          userId,
          ...(options?.tradeType && { tradeType: options.tradeType }),
          ...(options?.status && { status: options.status }),
        },
        orderBy: { createdAt: 'desc' },
        skip: options?.skip,
        take: options?.take || 50,
        include: { market: { select: { id: true, title: true, category: true } } },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findMarketTrades(marketId: string, options?: { skip?: number; take?: number }): Promise<Trade[]> {
    try {
      return await this.prisma.trade.findMany({
        where: { marketId, status: TradeStatus.CONFIRMED },
        orderBy: { createdAt: 'desc' },
        skip: options?.skip,
        take: options?.take || 100,
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getUserTradeVolume(userId: string): Promise<number> {
    try {
      const result = await this.prisma.trade.aggregate({
        where: { userId, status: TradeStatus.CONFIRMED, tradeType: { in: [TradeType.BUY, TradeType.SELL] } },
        _sum: { totalAmount: true },
      });
      return Number(result._sum.totalAmount || 0);
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getMarketTradeVolume(marketId: string): Promise<number> {
    try {
      const result = await this.prisma.trade.aggregate({
        where: { marketId, status: TradeStatus.CONFIRMED, tradeType: { in: [TradeType.BUY, TradeType.SELL] } },
        _sum: { totalAmount: true },
      });
      return Number(result._sum.totalAmount || 0);
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getTotalFeesCollected(): Promise<number> {
    try {
      const result = await this.prisma.trade.aggregate({
        where: { status: TradeStatus.CONFIRMED },
        _sum: { feeAmount: true },
      });
      return Number(result._sum.feeAmount || 0);
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getRecentTrades(limit: number = 20): Promise<Trade[]> {
    try {
      return await this.prisma.trade.findMany({
        where: { status: TradeStatus.CONFIRMED },
        orderBy: { confirmedAt: 'desc' },
        take: limit,
        include: {
          user: { select: { id: true, username: true, displayName: true } },
          market: { select: { id: true, title: true, category: true } },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async createBuyTrade(data: {
    userId: string; marketId: string; outcome: number;
    quantity: number; pricePerUnit: number; totalAmount: number; feeAmount: number; txHash: string;
  }): Promise<Trade> {
    return this.createTrade({ ...data, tradeType: TradeType.BUY });
  }

  async createSellTrade(data: {
    userId: string; marketId: string; outcome: number;
    quantity: number; pricePerUnit: number; totalAmount: number; feeAmount: number; txHash: string;
  }): Promise<Trade> {
    return this.createTrade({ ...data, tradeType: TradeType.SELL });
  }

  async findByUserAndMarket(userId: string, marketId: string): Promise<Trade[]> {
    try {
      return await this.prisma.trade.findMany({
        where: { userId, marketId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
