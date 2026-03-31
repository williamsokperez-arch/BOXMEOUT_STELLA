import crypto from 'crypto';
import { prisma } from '../database/prisma.js';

const HMAC_SECRET =
  process.env.REFERRAL_HMAC_SECRET || 'default_referral_secret';
const SIGNUP_BONUS = parseFloat(process.env.REFERRAL_SIGNUP_BONUS_USDC || '5');
const REFERRER_BONUS = parseFloat(process.env.REFERRER_BONUS_USDC || '10');
const FIRST_TRADE_BONUS = parseFloat(process.env.REFERRAL_FIRST_TRADE_BONUS_USDC || '5');

export class ReferralService {
  generateReferralCode(userId: string): string {
    // Encode userId (UUID) in base64url and append HMAC signature
    const idBuf = Buffer.from(userId.replace(/-/g, ''), 'hex');
    const idPart = idBuf.toString('base64url');
    const sig = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(idPart)
      .digest('base64url')
      .slice(0, 8);

    return `${idPart}.${sig}`;
  }

  private parseReferralCode(code: string): string | null {
    try {
      const [idPart, sig] = code.split('.');
      if (!idPart || !sig) return null;
      const expected = crypto
        .createHmac('sha256', HMAC_SECRET)
        .update(idPart)
        .digest('base64url')
        .slice(0, 8);
      if (expected !== sig) return null;

      const idBuf = Buffer.from(idPart, 'base64url');
      const hex = idBuf.toString('hex');
      // Reinsert dashes to match UUID format
      const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      return uuid;
    } catch {
      return null;
    }
  }

  async getReferralInfo(userId: string) {
    const code = this.generateReferralCode(userId);
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: { referredUser: { select: { id: true, username: true, createdAt: true } } },
    });
    const totalEarned = referrals.length * REFERRER_BONUS;

    return {
      referralCode: code,
      referralLink: `${process.env.FRONTEND_URL || 'https://app.example.com'}?ref=${code}`,
      referralsCount: referrals.length,
      totalEarned,
      referrals: referrals.map((r) => ({
        userId: r.referredUserId,
        username: r.referredUser?.username ?? null,
        joinedAt: r.referredSignupAt,
        rewardEarned: r.referrerBonusClaimed ? REFERRER_BONUS : 0,
      })),
      bonusRules: {
        referrerBonus: REFERRER_BONUS,
        signupBonus: SIGNUP_BONUS,
      },
    };
  }

  async claimReferral(referralCode: string, referredUserId: string) {
    const referrerId = this.parseReferralCode(referralCode);
    if (!referrerId) {
      throw new Error('Invalid referral code');
    }

    if (referrerId === referredUserId) {
      throw new Error('Cannot refer yourself');
    }

    // Check if referral already exists for this pair
    const existing = await prisma.referral.findUnique({
      where: {
        referrerId_referredUserId: {
          referrerId,
          referredUserId,
        },
      },
    });

    if (existing) {
      return { alreadyExists: true };
    }

    // Create referral record and award bonuses in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const referral = await tx.referral.create({
        data: {
          referrerId,
          referredUserId,
          referralCode,
          referredSignupAt: new Date(),
          signupBonusClaimed: true,
          referrerBonusClaimed: true,
        },
      });

      // Credit signup bonus to referred user
      const referredUser = await tx.user.update({
        where: { id: referredUserId },
        data: { usdcBalance: { increment: SIGNUP_BONUS } as any },
      });

      // Credit referrer bonus
      const referrerUser = await tx.user.update({
        where: { id: referrerId },
        data: { usdcBalance: { increment: REFERRER_BONUS } as any },
      });

      return { referral, referrerUser, referredUser };
    });

    return {
      alreadyExists: false,
      awarded: true,
      signupBonus: SIGNUP_BONUS,
      referrerBonus: REFERRER_BONUS,
      result,
    };
  }

  /**
   * Called at registration when a referralCode is provided.
   * Creates the referral record and awards the signup bonus to the new user.
   * The referrer bonus is deferred until the referred user makes their first trade.
   */
  async applyReferralAtRegistration(
    referralCode: string,
    newUserId: string
  ): Promise<void> {
    const referrerId = this.parseReferralCode(referralCode);
    if (!referrerId || referrerId === newUserId) return;

    const existing = await prisma.referral.findUnique({
      where: { referrerId_referredUserId: { referrerId, referredUserId: newUserId } },
    });
    if (existing) return;

    await prisma.$transaction(async (tx) => {
      await tx.referral.create({
        data: {
          referrerId,
          referredUserId: newUserId,
          referralCode,
          referredSignupAt: new Date(),
          signupBonusClaimed: true,
          referrerBonusClaimed: false,
        },
      });
      await tx.user.update({
        where: { id: newUserId },
        data: { usdcBalance: { increment: SIGNUP_BONUS } as any },
      });
    });
  }

  /**
   * Called after the referred user's first trade.
   * Awards the referrer bonus if not yet claimed.
   */
  async onFirstTrade(userId: string): Promise<void> {
    const referral = await prisma.referral.findFirst({
      where: { referredUserId: userId, referrerBonusClaimed: false },
    });
    if (!referral) return;

    await prisma.$transaction(async (tx) => {
      await tx.referral.update({
        where: { id: referral.id },
        data: { referrerBonusClaimed: true },
      });
      await tx.user.update({
        where: { id: referral.referrerId },
        data: { usdcBalance: { increment: FIRST_TRADE_BONUS } as any },
      });
    });
  }
}

export const referralService = new ReferralService();
