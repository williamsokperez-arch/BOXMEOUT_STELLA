// Prediction repository - data access layer for predictions
import { Prediction, PredictionStatus } from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';

export class PredictionRepository extends BaseRepository<Prediction> {
  getModelName(): string {
    return 'prediction';
  }

  async createPrediction(data: {
    userId: string;
    marketId: string;
    commitmentHash: string;
    encryptedSalt?: string;
    saltIv?: string;
    amountUsdc: number;
    transactionHash?: string;
    status?: PredictionStatus;
  }): Promise<Prediction> {
    try {
      return await this.prisma.prediction.create({
        data: { ...data, status: data.status || PredictionStatus.COMMITTED },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findByUserAndMarket(userId: string, marketId: string): Promise<Prediction | null> {
    try {
      return await this.prisma.prediction.findFirst({ where: { userId, marketId } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async revealPrediction(predictionId: string, predictedOutcome: number, revealTxHash?: string): Promise<Prediction> {
    try {
      return await this.prisma.prediction.update({
        where: { id: predictionId },
        data: {
          predictedOutcome,
          revealTxHash,
          status: PredictionStatus.REVEALED,
          revealedAt: new Date(),
          encryptedSalt: null,
          saltIv: null,
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async settlePrediction(predictionId: string, isWinner: boolean, pnlUsd: number): Promise<Prediction> {
    try {
      return await this.prisma.prediction.update({
        where: { id: predictionId },
        data: { status: PredictionStatus.SETTLED, isWinner, pnlUsd, settledAt: new Date() },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async claimWinnings(predictionId: string): Promise<Prediction> {
    try {
      return await this.prisma.prediction.update({
        where: { id: predictionId },
        data: { winningsClaimed: true },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findUserPredictions(
    userId: string,
    options?: { status?: PredictionStatus; skip?: number; take?: number }
  ): Promise<Prediction[]> {
    try {
      return await this.prisma.prediction.findMany({
        where: { userId, ...(options?.status && { status: options.status }) },
        orderBy: { createdAt: 'desc' },
        skip: options?.skip,
        take: options?.take || 50,
        include: {
          market: { select: { id: true, title: true, category: true, status: true, outcomeA: true, outcomeB: true } },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findMarketPredictions(marketId: string): Promise<Prediction[]> {
    try {
      return await this.prisma.prediction.findMany({
        where: { marketId, status: PredictionStatus.REVEALED },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getUnclaimedWinnings(userId: string): Promise<Prediction[]> {
    try {
      return await this.prisma.prediction.findMany({
        where: { userId, status: PredictionStatus.SETTLED, isWinner: true, winningsClaimed: false },
        include: { market: { select: { id: true, title: true, category: true } } },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getUserPredictionStats(userId: string) {
    try {
      const [total, wins, losses, totalPnl, avgPnl] = await Promise.all([
        this.prisma.prediction.count({ where: { userId, status: PredictionStatus.SETTLED } }),
        this.prisma.prediction.count({ where: { userId, status: PredictionStatus.SETTLED, isWinner: true } }),
        this.prisma.prediction.count({ where: { userId, status: PredictionStatus.SETTLED, isWinner: false } }),
        this.prisma.prediction.aggregate({ where: { userId, status: PredictionStatus.SETTLED }, _sum: { pnlUsd: true } }),
        this.prisma.prediction.aggregate({ where: { userId, status: PredictionStatus.SETTLED }, _avg: { pnlUsd: true } }),
      ]);
      return {
        totalPredictions: total,
        wins,
        losses,
        winRate: total > 0 ? (wins / total) * 100 : 0,
        totalPnl: totalPnl._sum.pnlUsd || 0,
        avgPnl: avgPnl._avg.pnlUsd || 0,
      };
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getMarketPredictionStats(marketId: string) {
    try {
      const [total, yesCount, noCount, totalVolume] = await Promise.all([
        this.prisma.prediction.count({ where: { marketId, status: PredictionStatus.REVEALED } }),
        this.prisma.prediction.count({ where: { marketId, status: PredictionStatus.REVEALED, predictedOutcome: 1 } }),
        this.prisma.prediction.count({ where: { marketId, status: PredictionStatus.REVEALED, predictedOutcome: 0 } }),
        this.prisma.prediction.aggregate({ where: { marketId, status: PredictionStatus.REVEALED }, _sum: { amountUsdc: true } }),
      ]);
      return {
        totalPredictions: total,
        yesCount,
        noCount,
        yesPercentage: total > 0 ? (yesCount / total) * 100 : 0,
        noPercentage: total > 0 ? (noCount / total) * 100 : 0,
        totalVolume: totalVolume._sum.amountUsdc || 0,
      };
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
