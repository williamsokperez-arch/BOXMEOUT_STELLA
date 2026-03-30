import { Request, Response } from 'express';
import { referralService } from '../services/referral.service.js';
import { logger } from '../utils/logger.js';

export class ReferralsController {
  private getUserId(req: Request): string | null {
    // @ts-expect-error req.user attached by requireAuth
    return req.user?.userId ?? null;
  }

  async getCode(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
        return;
      }
      const code = referralService.generateReferralCode(userId);
      const link = `${process.env.FRONTEND_URL || 'https://app.example.com'}?ref=${code}`;
      res.status(200).json({ success: true, data: { referralCode: code, referralLink: link } });
    } catch (error) {
      (req.log || logger).error('Get referral code error', { error });
      res.status(500).json({ success: false, error: { message: (error as Error).message } });
    }
  }

  async getInfo(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
        return;
      }
      const info = await referralService.getReferralInfo(userId);
      res.status(200).json({ success: true, data: info });
    } catch (error) {
      (req.log || logger).error('Get referral info error', { error });
      res.status(500).json({ success: false, error: { message: (error as Error).message } });
    }
  }

  async claim(req: Request, res: Response): Promise<void> {
    try {
      const { referralCode } = req.body;
      if (!referralCode) {
        res.status(400).json({ success: false, error: { message: 'referralCode required' } });
        return;
      }
      const referredUserId = this.getUserId(req);
      if (!referredUserId) {
        res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
        return;
      }
      const result = await referralService.claimReferral(referralCode, referredUserId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      (req.log || logger).error('Claim referral error', { error });
      res.status(400).json({ success: false, error: { message: (error as Error).message } });
    }
  }
}

export const referralsController = new ReferralsController();
