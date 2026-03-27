// User repository - data access layer for users
import { User, UserTier, Prisma } from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';

export class UserRepository extends BaseRepository<User> {
  getModelName(): string {
    return 'user';
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({ where: { email } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({ where: { username } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({ where: { walletAddress } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async createUser(data: {
    email: string;
    username: string;
    passwordHash: string;
    displayName?: string;
    walletAddress?: string;
  }): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateBalance(userId: string, usdcBalance?: number, xlmBalance?: number): Promise<User> {
    try {
      const updateData: any = {};
      if (usdcBalance !== undefined) updateData.usdcBalance = usdcBalance;
      if (xlmBalance !== undefined) updateData.xlmBalance = xlmBalance;
      return await this.prisma.user.update({ where: { id: userId }, data: updateData });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateWalletAddress(userId: string, walletAddress: string): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id: userId }, data: { walletAddress } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateTier(userId: string, tier: UserTier): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id: userId }, data: { tier } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateLastLogin(userId: string): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id: userId }, data: { lastLogin: new Date() } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async searchUsers(query: string, limit: number = 10): Promise<Partial<User>[]> {
    try {
      return await this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
          isActive: true,
        },
        take: limit,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          tier: true,
          reputationScore: true,
          createdAt: true,
        },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getUserStats(userId: string) {
    try {
      const [user, predictionCount, winCount, totalPnl] = await Promise.all([
        this.findById(userId),
        this.prisma.prediction.count({ where: { userId, status: 'SETTLED' } }),
        this.prisma.prediction.count({ where: { userId, status: 'SETTLED', isWinner: true } }),
        this.prisma.prediction.aggregate({
          where: { userId, status: 'SETTLED' },
          _sum: { pnlUsd: true },
        }),
      ]);
      return {
        user,
        predictionCount,
        winCount,
        lossCount: predictionCount - winCount,
        winRate: predictionCount > 0 ? (winCount / predictionCount) * 100 : 0,
        totalPnl: totalPnl._sum.pnlUsd || 0,
      };
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
