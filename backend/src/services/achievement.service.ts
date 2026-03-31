// backend/src/services/achievement.service.ts
// Achievement engine — awards achievements after prediction settlement
// and emits real-time WebSocket notifications.

import { prisma } from '../database/prisma.js';
import { AchievementTier, NotificationType } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';

// ============================================================================
// ACHIEVEMENT CATALOG
// Every entry defines when to award and how to check eligibility.
// ============================================================================

export interface AchievementDefinition {
  name: string;
  description: string;
  tier: AchievementTier;
  badgeUrl: string;
  /** Returns true if the user qualifies for this achievement right now. */
  check: (userId: string) => Promise<boolean>;
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  // ── Onboarding ──────────────────────────────────────────────────────────────
  {
    name: 'first_prediction',
    description: 'Made your very first prediction.',
    tier: AchievementTier.BRONZE,
    badgeUrl: '/badges/first-prediction.png',
    check: async (userId) => {
      const count = await prisma.prediction.count({ where: { userId } });
      return count >= 1;
    },
  },

  // ── Volume milestones ────────────────────────────────────────────────────────
  {
    name: 'ten_predictions',
    description: 'Completed 10 predictions.',
    tier: AchievementTier.BRONZE,
    badgeUrl: '/badges/ten-predictions.png',
    check: async (userId) => {
      const count = await prisma.prediction.count({ where: { userId } });
      return count >= 10;
    },
  },
  {
    name: 'fifty_predictions',
    description: 'Completed 50 predictions.',
    tier: AchievementTier.SILVER,
    badgeUrl: '/badges/fifty-predictions.png',
    check: async (userId) => {
      const count = await prisma.prediction.count({ where: { userId } });
      return count >= 50;
    },
  },
  {
    name: 'century_club',
    description: 'Completed 100 predictions.',
    tier: AchievementTier.GOLD,
    badgeUrl: '/badges/century.png',
    check: async (userId) => {
      const count = await prisma.prediction.count({ where: { userId } });
      return count >= 100;
    },
  },

  // ── Win streaks ──────────────────────────────────────────────────────────────
  {
    name: 'win_streak_5',
    description: 'Won 5 predictions in a row.',
    tier: AchievementTier.SILVER,
    badgeUrl: '/badges/win-streak-5.png',
    check: async (userId) => {
      return checkWinStreak(userId, 5);
    },
  },
  {
    name: 'win_streak_10',
    description: 'Won 10 predictions in a row.',
    tier: AchievementTier.GOLD,
    badgeUrl: '/badges/win-streak-10.png',
    check: async (userId) => {
      return checkWinStreak(userId, 10);
    },
  },
  {
    name: 'win_streak_25',
    description: 'Unstoppable — 25 wins in a row!',
    tier: AchievementTier.PLATINUM,
    badgeUrl: '/badges/win-streak-25.png',
    check: async (userId) => {
      return checkWinStreak(userId, 25);
    },
  },

  // ── Whale ────────────────────────────────────────────────────────────────────
  {
    name: 'whale',
    description: 'Staked over $1,000 USDC in a single prediction.',
    tier: AchievementTier.GOLD,
    badgeUrl: '/badges/whale.png',
    check: async (userId) => {
      const big = await prisma.prediction.findFirst({
        where: { userId, amountUsdc: { gte: 1000 } },
      });
      return big !== null;
    },
  },
  {
    name: 'mega_whale',
    description: 'Staked over $10,000 USDC in a single prediction.',
    tier: AchievementTier.PLATINUM,
    badgeUrl: '/badges/mega-whale.png',
    check: async (userId) => {
      const big = await prisma.prediction.findFirst({
        where: { userId, amountUsdc: { gte: 10000 } },
      });
      return big !== null;
    },
  },

  // ── Accuracy ─────────────────────────────────────────────────────────────────
  {
    name: 'sharp_shooter',
    description: 'Win rate ≥ 70% across at least 20 settled predictions.',
    tier: AchievementTier.GOLD,
    badgeUrl: '/badges/sharp-shooter.png',
    check: async (userId) => {
      const stats = await prisma.prediction.aggregate({
        where: { userId, status: 'SETTLED' },
        _count: { _all: true },
      });
      if (stats._count._all < 20) return false;
      const wins = await prisma.prediction.count({
        where: { userId, status: 'SETTLED', isWinner: true },
      });
      return wins / stats._count._all >= 0.7;
    },
  },

  // ── PnL milestones ───────────────────────────────────────────────────────────
  {
    name: 'first_win',
    description: 'Won your first prediction — money in the pocket!',
    tier: AchievementTier.BRONZE,
    badgeUrl: '/badges/first-win.png',
    check: async (userId) => {
      const win = await prisma.prediction.findFirst({
        where: { userId, isWinner: true },
      });
      return win !== null;
    },
  },
  {
    name: 'profit_100',
    description: 'Accumulated $100 in total winnings.',
    tier: AchievementTier.SILVER,
    badgeUrl: '/badges/profit-100.png',
    check: async (userId) => {
      const agg = await prisma.prediction.aggregate({
        where: { userId, isWinner: true },
        _sum: { pnlUsd: true },
      });
      return Number(agg._sum.pnlUsd ?? 0) >= 100;
    },
  },
  {
    name: 'profit_1000',
    description: 'Accumulated $1,000 in total winnings.',
    tier: AchievementTier.GOLD,
    badgeUrl: '/badges/profit-1000.png',
    check: async (userId) => {
      const agg = await prisma.prediction.aggregate({
        where: { userId, isWinner: true },
        _sum: { pnlUsd: true },
      });
      return Number(agg._sum.pnlUsd ?? 0) >= 1000;
    },
  },
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if the user's most recent `n` settled predictions are all wins.
 */
async function checkWinStreak(userId: string, n: number): Promise<boolean> {
  const recent = await prisma.prediction.findMany({
    where: { userId, status: 'SETTLED' },
    orderBy: { createdAt: 'desc' },
    take: n,
    select: { isWinner: true },
  });
  if (recent.length < n) return false;
  return recent.every((p) => p.isWinner === true);
}

// ============================================================================
// ACHIEVEMENT SERVICE
// ============================================================================

export type AchievementEvent =
  | 'first_trade'
  | 'prediction_settled'
  | 'referral_converted'
  | 'trade_completed';

export class AchievementService {
  /**
   * Run all achievement checks for a user after a relevant event.
   * Already-awarded achievements are skipped (idempotent via unique constraint).
   */
  async checkAndAward(userId: string, _event?: AchievementEvent): Promise<void> {
    try {
      // Fetch already-awarded achievement names for this user
      const existing = await prisma.achievement.findMany({
        where: { userId },
        select: { achievementName: true },
      });
      const alreadyAwarded = new Set(existing.map((a) => a.achievementName));

      const toCheck = ACHIEVEMENT_CATALOG.filter(
        (def) => !alreadyAwarded.has(def.name)
      );

      // Run checks concurrently
      const results = await Promise.allSettled(
        toCheck.map(async (def) => {
          const qualifies = await def.check(userId);
          if (qualifies) {
            await this.award(userId, def);
          }
        })
      );

      // Log any check failures (non-fatal)
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          logger.warn('Achievement check failed', {
            userId,
            achievement: toCheck[idx]?.name,
            error: r.reason,
          });
        }
      });
    } catch (error) {
      logger.error('Achievement engine error', { userId, error });
    }
  }

  /**
   * Award an achievement and emit a WebSocket + persist notification.
   * Uses upsert so re-runs are safe.
   */
  private async award(
    userId: string,
    def: AchievementDefinition
  ): Promise<void> {
    try {
      await prisma.achievement.create({
        data: {
          userId,
          achievementName: def.name,
          description: def.description,
          tier: def.tier,
          badgeUrl: def.badgeUrl,
        },
      });

      logger.info('Achievement awarded', {
        userId,
        achievement: def.name,
        tier: def.tier,
      });

      // Notify user via WebSocket + DB notification
      await notificationService.createNotification(
        userId,
        NotificationType.ACHIEVEMENT,
        `🏆 Achievement unlocked: ${def.name.replace(/_/g, ' ')}`,
        def.description,
        { achievementName: def.name, tier: def.tier, badgeUrl: def.badgeUrl }
      );
    } catch (error: any) {
      // Unique constraint violation = already awarded — safe to ignore
      if (error?.code === 'P2002') {
        logger.debug('Achievement already awarded, skipping', {
          userId,
          achievement: def.name,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Get all achievements for a user.
   */
  async getUserAchievements(userId: string) {
    return prisma.achievement.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    });
  }
}

export const achievementService = new AchievementService();
