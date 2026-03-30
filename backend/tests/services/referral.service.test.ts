import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReferralService } from '../../src/services/referral.service.js';

vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    referral: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { update: vi.fn() },
    $transaction: vi.fn((cb: any) => cb({
      referral: { create: vi.fn().mockResolvedValue({ id: 'r1' }), update: vi.fn() },
      user: { update: vi.fn().mockResolvedValue({}) },
    })),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '../../src/database/prisma.js';

describe('ReferralService', () => {
  let service: ReferralService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReferralService();
  });

  describe('generateReferralCode', () => {
    it('generates a deterministic code for a given userId', () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const code1 = service.generateReferralCode(userId);
      const code2 = service.generateReferralCode(userId);
      expect(code1).toBe(code2);
      expect(code1).toContain('.');
    });

    it('generates different codes for different users', () => {
      const code1 = service.generateReferralCode('550e8400-e29b-41d4-a716-446655440000');
      const code2 = service.generateReferralCode('660e8400-e29b-41d4-a716-446655440001');
      expect(code1).not.toBe(code2);
    });
  });

  describe('getReferralInfo', () => {
    it('returns referral code, link, count, and referred list', async () => {
      vi.mocked(prisma.referral.findMany).mockResolvedValue([
        {
          id: 'r1',
          referrerId: 'user-1',
          referredUserId: 'user-2',
          referralCode: 'abc.def',
          referredSignupAt: new Date(),
          referrerBonusClaimed: true,
          referredUser: { id: 'user-2', username: 'alice', createdAt: new Date() },
        } as any,
      ]);

      const info = await service.getReferralInfo('user-1');

      expect(info.referralCode).toBeTruthy();
      expect(info.referralLink).toContain(info.referralCode);
      expect(info.referralsCount).toBe(1);
      expect(info.referrals).toHaveLength(1);
      expect(info.referrals[0].username).toBe('alice');
    });
  });

  describe('applyReferralAtRegistration', () => {
    it('creates referral record and awards signup bonus', async () => {
      const referrerId = '550e8400-e29b-41d4-a716-446655440000';
      const newUserId = '660e8400-e29b-41d4-a716-446655440001';
      const code = service.generateReferralCode(referrerId);

      vi.mocked(prisma.referral.findUnique).mockResolvedValue(null);

      await service.applyReferralAtRegistration(code, newUserId);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('is idempotent — does nothing if referral already exists', async () => {
      const referrerId = '550e8400-e29b-41d4-a716-446655440000';
      const newUserId = '660e8400-e29b-41d4-a716-446655440001';
      const code = service.generateReferralCode(referrerId);

      vi.mocked(prisma.referral.findUnique).mockResolvedValue({ id: 'existing' } as any);

      await service.applyReferralAtRegistration(code, newUserId);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignores invalid referral codes silently', async () => {
      await service.applyReferralAtRegistration('invalid-code', 'user-x');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('onFirstTrade', () => {
    it('awards referrer bonus on first trade', async () => {
      vi.mocked(prisma.referral.findFirst).mockResolvedValue({
        id: 'r1',
        referrerId: 'referrer-1',
        referredUserId: 'user-1',
        referrerBonusClaimed: false,
      } as any);

      await service.onFirstTrade('user-1');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('does nothing if no unclaimed referral exists', async () => {
      vi.mocked(prisma.referral.findFirst).mockResolvedValue(null);

      await service.onFirstTrade('user-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
