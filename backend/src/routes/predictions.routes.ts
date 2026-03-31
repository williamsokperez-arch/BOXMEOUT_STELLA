// backend/src/routes/predictions.routes.ts - User Predictions Routes (issue #21)

import { Router, Request, Response } from 'express';
import { predictionsController } from '../controllers/predictions.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { getUserPredictionsQuery, placePredictionBody } from '../schemas/validation.schemas.js';
import { AuthenticatedRequest } from '../types/auth.types.js';

const router: Router = Router();

/**
 * @swagger
 * /api/predictions:
 *   post:
 *     summary: Place a prediction
 *     description: Record a user's prediction on a market outcome for tracking and leaderboard scoring.
 *     tags: [Predictions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketId, outcomeId, confidence]
 *             properties:
 *               marketId:
 *                 type: string
 *                 format: uuid
 *               outcomeId:
 *                 type: integer
 *                 enum: [0, 1]
 *                 description: 0 = outcomeB (NO), 1 = outcomeA (YES)
 *               confidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1000000
 *     responses:
 *       201:
 *         description: Prediction created
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: User has already predicted on this market
 *       422:
 *         description: Market is not open for predictions
 */
router.post(
  '/',
  requireAuth,
  validate({ body: placePredictionBody }),
  (req: Request, res: Response) => predictionsController.placePrediction(req as AuthenticatedRequest, res)
);

/**
 * @swagger
 * /api/predictions:
 *   get:
 *     summary: Get authenticated user's predictions
 *     description: Returns paginated predictions placed by the authenticated user with settlement status.
 *     tags: [Predictions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, won, lost]
 *         description: Filter by settlement status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of user predictions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       marketQuestion:
 *                         type: string
 *                       outcomeLabel:
 *                         type: string
 *                       confidence:
 *                         type: number
 *                       pointsEarned:
 *                         type: number
 *                       status:
 *                         type: string
 *                         enum: [pending, won, lost]
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  requireAuth,
  validate({ query: getUserPredictionsQuery }),
  (req: Request, res: Response) => predictionsController.getUserPredictions(req as AuthenticatedRequest, res)
);

export default router;
