import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AchievementService, ACHIEVEMENT_CATALOG } from '../../src/services/achievement.service.js';

vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    achievement: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    prediction: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/notification.service.js', () => ({
  notificationService: { createNotification: vi.fn() },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '../../src/database/prisma.js';

describe('AchievementService', () => {
  let service: AchievementService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AchievementService();
  });

  describe('checkAndAward', () => {
    it('awards first_trade achievement on first_trade event', async () => {
      // No achievements yet
      vi.mocked(prisma.achievement.findMany).mockResolvedValue([]);
      // first_prediction check: count >= 1
      vi.mocked(prisma.prediction.count).mockResolvedValue(1);
      // Other checks return false
      vi.mocked(prisma.prediction.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.prediction.findMany).mockResolvedValue([]);
      vi.mocked(prisma.prediction.aggregate).mockResolvedValue({
        _count: { _all: 0 },
        _sum: { pnlUsd: 0 },
      } as any);
      vi.mocked(prisma.achievement.create).mockResolvedValue({} as any);

      await service.checkAndAward('user-1', 'first_trade');

      // first_prediction should be awarded (count >= 1)
      expect(prisma.achievement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ achievementName: 'first_prediction' }),
        })
      );
    });

    it('does not award already-earned achievements (idempotent)', async () => {
      // All achievements already awarded
      vi.mocked(prisma.achievement.findMany).mockResolvedValue(
        ACHIEVEMENT_CATALOG.map((def) => ({ achievementName: def.name } as any))
      );

      await service.checkAndAward('user-1', 'first_trade');

      expect(prisma.achievement.create).not.toHaveBeenCalled();
    });

    it('second trigger for same achievement is ignored via unique constraint', async () => {
      vi.mocked(prisma.achievement.findMany).mockResolvedValue([]);
      vi.mocked(prisma.prediction.count).mockResolvedValue(1);
      vi.mocked(prisma.prediction.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.prediction.findMany).mockResolvedValue([]);
      vi.mocked(prisma.prediction.aggregate).mockResolvedValue({
        _count: { _all: 0 },
        _sum: { pnlUsd: 0 },
      } as any);

      // First call succeeds
      vi.mocked(prisma.achievement.create).mockResolvedValueOnce({} as any);
      await service.checkAndAward('user-1', 'first_trade');
      expect(prisma.achievement.create).toHaveBeenCalledTimes(1);

      // Second call: unique constraint violation (P2002) — silently ignored
      vi.clearAllMocks();
      vi.mocked(prisma.achievement.findMany).mockResolvedValue([]);
      vi.mocked(prisma.prediction.count).mockResolvedValue(2);
      vi.mocked(prisma.prediction.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.prediction.findMany).mockResolvedValue([]);
      vi.mocked(prisma.prediction.aggregate).mockResolvedValue({
        _count: { _all: 0 },
        _sum: { pnlUsd: 0 },
      } as any);
      vi.mocked(prisma.achievement.create).mockRejectedValue({ code: 'P2002' });

      await expect(service.checkAndAward('user-1', 'first_trade')).resolves.not.toThrow();
    });
  });

  describe('getUserAchievements', () => {
    it('returns all achievements for a user ordered by earnedAt desc', async () => {
      const mockAchievements = [
        { id: 'a1', achievementName: 'first_prediction', earnedAt: new Date() },
      ];
      vi.mocked(prisma.achievement.findMany).mockResolvedValue(mockAchievements as any);

      const result = await service.getUserAchievements('user-1');

      expect(prisma.achievement.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { earnedAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });
});
