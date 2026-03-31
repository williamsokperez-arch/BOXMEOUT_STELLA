// backend/src/controllers/predictions.controller.ts - Predictions Controller
// Handles prediction/betting requests

import { Request, Response } from 'express';
import { PredictionService } from '../services/prediction.service.js';
import { PredictionRepository } from '../repositories/prediction.repository.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';

const predictionRepository = new PredictionRepository();

class PredictionsController {
  private predictionService: PredictionService;

  constructor() {
    this.predictionService = new PredictionService();
  }

  /**
   * POST /api/markets/:marketId/commit - Commit Prediction (Phase 1)
   * Server generates and stores salt securely
   */
  async commitPrediction(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { predictedOutcome, amountUsdc } = req.body;

      // Validate input
      // ... (rest is same, just fixing param extraction)

      // ...

      const result = await this.predictionService.commitPrediction(
        userId,
        marketId,
        predictedOutcome,
        amountUsdc
      );

      // ...
    } catch (error: any) {
      // ...
    }
  }

  /**
   * POST /api/markets/:marketId/reveal - Reveal Prediction (Phase 2)
   * Server provides stored salt for blockchain verification
   */
  async revealPrediction(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { predictionId } = req.body;

      // ...

      const result = await this.predictionService.revealPrediction(
        userId,
        predictionId,
        marketId
      );

      // ...
    } catch (error: any) {
      // ...
    }
  }
  /**
   * POST /api/predictions — place a prediction (tracking + leaderboard)
   */
  async placePrediction(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }

      const { marketId, outcomeId, confidence } = req.body;

      const prediction = await this.predictionService.placePrediction(userId, marketId, outcomeId, confidence);

      res.status(201).json({ success: true, data: prediction });
    } catch (error: any) {
      if (error.message === 'DUPLICATE_PREDICTION') {
        res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'You have already predicted on this market' } });
        return;
      }
      if (error.message === 'Market not found') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Market not found' } });
        return;
      }
      if (error.message === 'Market is not open for predictions') {
        res.status(422).json({ success: false, error: { code: 'MARKET_CLOSED', message: error.message } });
        return;
      }
      logger.error('PredictionsController.placePrediction error', { error });
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  }

  /**
   * GET /api/predictions — requires auth (issue #21)
   * Returns paginated predictions for the authenticated user.
   * Query: status (pending|won|lost), page, limit
   */
  async getUserPredictions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const { status, page, limit } = req.query as any;

      const { predictions, total } = await predictionRepository.findUserPredictionsPaginated(
        userId,
        { status, page: Number(page), limit: Number(limit) }
      );

      // Shape each prediction to include the required fields
      const data = predictions.map((p: any) => {
        const outcomeLabel =
          p.predictedOutcome === null
            ? null
            : p.predictedOutcome === 1
            ? p.market?.outcomeA ?? 'YES'
            : p.market?.outcomeB ?? 'NO';

        // Derive a simple status label
        let statusLabel: string;
        if (p.status === 'SETTLED') {
          statusLabel = p.isWinner ? 'won' : 'lost';
        } else {
          statusLabel = 'pending';
        }

        return {
          id: p.id,
          marketId: p.marketId,
          marketQuestion: p.market?.title ?? null,
          outcomeLabel,
          confidence: p.amountUsdc,       // amountUsdc serves as confidence proxy
          pointsEarned: p.pnlUsd ?? null, // pnlUsd is points earned on settlement
          status: statusLabel,
          createdAt: p.createdAt,
          settledAt: p.settledAt ?? null,
        };
      });

      res.status(200).json({
        success: true,
        data,
        meta: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error: any) {
      logger.error('PredictionsController.getUserPredictions error', { error });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export const predictionsController = new PredictionsController();

/*
TODO: POST /api/markets/:market_id/buy-shares - Buy Shares Controller
- Require authentication
- Extract: market_id, outcome, amount_usdc from body
- Validate: market OPEN, amount > 0, user balance sufficient
- Call: PredictionService.buyShares(user_id, market_id, outcome, amount_usdc)
- Return: shares_received, total_cost, average_price
- Handle slippage errors gracefully
*/

/*
TODO: POST /api/markets/:market_id/sell-shares - Sell Shares Controller
- Require authentication
- Extract: market_id, outcome, shares_to_sell
- Validate: user owns shares, shares > 0
- Call: PredictionService.sellShares(user_id, market_id, outcome, shares_to_sell)
- Return: proceeds_after_fee, average_price
*/

/*
TODO: GET /api/markets/:market_id/predictions - Get Market Predictions Controller
- Extract: market_id, outcome (filter), sort, offset, limit
- Call: PredictionService.getMarketPredictions(market_id, outcome, sort, offset, limit)
- Return: list of predictions with aggregates
*/

/*
TODO: GET /api/users/:user_id/positions - Get User Positions Controller
- Require authentication (can only view own or if admin)
- Extract user_id from params
- Call: PredictionService.getUserPositions(user_id)
- Return: all open positions with current values
*/

/*
TODO: GET /api/users/:user_id/prediction-history - Prediction History Controller
- Require authentication
- Extract: user_id, offset, limit, date_range
- Call: PredictionService.getPredictionHistory(user_id, offset, limit)
- Return: all historical predictions with outcomes
*/

/*
TODO: POST /api/users/:user_id/claim-winnings - Claim Winnings Controller
- Require authentication
- Extract user_id
- Call: PredictionService.claimWinnings(user_id)
- Execute blockchain transaction
- Return: amount_claimed, breakdown_by_market
*/

/*
TODO: POST /api/users/:user_id/refund-bet - Refund Losing Bet Controller
- Require authentication
- Extract: user_id, market_id (to refund specific)
- Call: PredictionService.refundLosingBet(user_id, market_id)
- Return: refund_amount
*/

/*
TODO: GET /api/markets/:market_id/liquidity-pools - LP Info Controller
- Extract market_id
- Call: PredictionService.getLiquidityPoolInfo(market_id)
- Return: pool state, liquidity, fees
*/

/*
TODO: POST /api/markets/:market_id/add-liquidity - Add Liquidity Controller
- Require authentication
- Extract: market_id, amount_usdc
- Call: PredictionService.addLiquidity(user_id, market_id, amount_usdc)
- Return: lp_tokens_issued, share_of_pool
*/

/*
TODO: POST /api/users/:user_id/claim-lp-fees - Claim LP Fees Controller
- Require authentication
- Extract: user_id, market_id (specific pool or all)
- Call: PredictionService.claimLPFees(user_id, market_id)
- Return: total_fees_claimed
*/

export default {};
