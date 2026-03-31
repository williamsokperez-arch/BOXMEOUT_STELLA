import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { TreasuryService } from '../services/treasury.service.js';
import { logger } from '../utils/logger.js';

export class TreasuryController {
  private treasuryService: TreasuryService;

  constructor() {
    this.treasuryService = new TreasuryService();
  }

  async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = await this.treasuryService.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      (req.log || logger).error('Get treasury stats error', { error });
      res.status(500).json({
        success: false,
        error: { code: 'TREASURY_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch stats' },
      });
    }
  }

  async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const result = await this.treasuryService.getHistory(page, limit);
      res.json({ success: true, data: result.data, meta: { page, limit, total: result.total } });
    } catch (error) {
      (req.log || logger).error('Get treasury history error', { error });
      res.status(500).json({
        success: false,
        error: { code: 'TREASURY_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch history' },
      });
  async collectProtocolFees(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const { marketId } = req.params;
      const result = await this.treasuryService.collectProtocolFees(marketId, req.user.userId);
      res.json({ success: true, data: result });
    } catch (error) {
      const code = (error as any).code;
      if (code === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: { code, message: (error as Error).message } });
      } else if (code === 'INVALID_STATE' || code === 'EMPTY_POOL') {
        res.status(400).json({ success: false, error: { code, message: (error as Error).message } });
      } else {
        (req.log || logger).error('Collect protocol fees error', { error });
        res.status(500).json({ success: false, error: { code: 'TREASURY_ERROR', message: error instanceof Error ? error.message : 'Failed to collect fees' } });
      }
    }
  }

  async getBalances(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const balances = await this.treasuryService.getBalances();

      res.json({
        success: true,
        data: balances,
      });
    } catch (error) {
      (req.log || logger).error('Get balances error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'TREASURY_ERROR',
          message:
            error instanceof Error ? error.message : 'Failed to fetch balances',
        },
      });
    }
  }

  async distributeLeaderboard(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      // req.body is already validated by middleware
      const result = await this.treasuryService.distributeLeaderboard(
        req.body.recipients,
        req.user.userId
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      (req.log || logger).error('Distribute leaderboard error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'DISTRIBUTION_ERROR',
          message:
            error instanceof Error ? error.message : 'Distribution failed',
        },
      });
    }
  }

  async distributeCreator(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      // req.body is already validated by middleware
      const { marketId, creatorAddress, amount } = req.body;

      const result = await this.treasuryService.distributeCreator(
        marketId,
        creatorAddress,
        amount,
        req.user.userId
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      (req.log || logger).error('Distribute creator error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'DISTRIBUTION_ERROR',
          message:
            error instanceof Error ? error.message : 'Distribution failed',
        },
      });
    }
  }
}

export const treasuryController = new TreasuryController();
