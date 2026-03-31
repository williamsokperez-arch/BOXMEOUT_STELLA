import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/controllers/predictions.controller.js', () => ({
  predictionsController: {
    placePrediction: vi.fn(),
    getUserPredictions: vi.fn((_req: any, res: any) => res.json({ success: true, data: [] })),
    commitPrediction: vi.fn(),
    revealPrediction: vi.fn(),
  },
}));

vi.mock('../../src/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-123' };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/services/stellar.service.js', () => ({
  stellarService: { isValidPublicKey: vi.fn().mockReturnValue(true) },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import predictionsRoutes from '../../src/routes/predictions.routes.js';
import { predictionsController } from '../../src/controllers/predictions.controller.js';
import { PredictionService } from '../../src/services/prediction.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MARKET_ID = '00000000-0000-0000-0000-000000000001';

const validBody = { marketId: MARKET_ID, outcomeId: 1, confidence: 50 };

const mockPrediction = {
  id: 'pred-001',
  userId: 'user-123',
  marketId: MARKET_ID,
  predictedOutcome: 1,
  amountUsdc: '50.000000',
  status: 'COMMITTED',
  createdAt: new Date().toISOString(),
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/predictions', predictionsRoutes);
  return app;
}

// ── Route tests ───────────────────────────────────────────────────────────────

describe('POST /api/predictions — route', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('returns 201 with prediction record on success', async () => {
    vi.mocked(predictionsController.placePrediction).mockImplementation(
      (_req, res) => { res.status(201).json({ success: true, data: mockPrediction }); return Promise.resolve(); }
    );

    const res = await request(app).post('/api/predictions').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('pred-001');
    expect(res.body.data.marketId).toBe(MARKET_ID);
  });

  it('returns 409 when user already predicted on this market', async () => {
    vi.mocked(predictionsController.placePrediction).mockImplementation(
      (_req, res) => {
        res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'You have already predicted on this market' } });
        return Promise.resolve();
      }
    );

    const res = await request(app).post('/api/predictions').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 for missing marketId', async () => {
    const res = await request(app).post('/api/predictions').send({ outcomeId: 1, confidence: 50 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid outcomeId (out of range)', async () => {
    const res = await request(app).post('/api/predictions').send({ ...validBody, outcomeId: 5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-positive confidence', async () => {
    const res = await request(app).post('/api/predictions').send({ ...validBody, confidence: -1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid UUID marketId', async () => {
    const res = await request(app).post('/api/predictions').send({ ...validBody, marketId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});

// ── Service unit tests ────────────────────────────────────────────────────────

vi.mock('../../src/repositories/prediction.repository.js', () => ({
  PredictionRepository: vi.fn().mockImplementation(() => predRepoMock),
}));

vi.mock('../../src/repositories/market.repository.js', () => ({
  MarketRepository: vi.fn().mockImplementation(() => marketRepoMock),
}));

vi.mock('../../src/repositories/user.repository.js', () => ({
  UserRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/services/blockchain/market.js', () => ({
  marketBlockchainService: {},
  MarketBlockchainService: vi.fn(),
}));

vi.mock('../../src/websocket/realtime.js', () => ({
  notifyPositionChanged: vi.fn(),
  notifyWinningsClaimed: vi.fn(),
  notifyBalanceUpdated: vi.fn(),
}));

vi.mock('../../src/services/leaderboard.service.js', () => ({
  leaderboardService: { awardAccuracyPoints: vi.fn(), calculateRanks: vi.fn() },
}));

vi.mock('../../src/services/notification.service.js', () => ({
  notificationService: { notifyPredictionResult: vi.fn(), notifyWinningsAvailable: vi.fn() },
}));

vi.mock('../../src/database/transaction.js', () => ({
  executeTransaction: vi.fn((fn: any) => fn({})),
}));

const predRepoMock = {
  findByUserAndMarket: vi.fn(),
  placePrediction: vi.fn(),
};

const marketRepoMock = {
  findById: vi.fn(),
};

const openMarket = {
  id: MARKET_ID,
  status: 'OPEN',
  closingAt: new Date(Date.now() + 86400_000),
  title: 'Test market',
  outcomeA: 'YES',
  outcomeB: 'NO',
};

describe('PredictionService.placePrediction', () => {
  let service: PredictionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PredictionService();
  });

  it('creates and returns prediction for valid input', async () => {
    marketRepoMock.findById.mockResolvedValue(openMarket);
    predRepoMock.findByUserAndMarket.mockResolvedValue(null);
    predRepoMock.placePrediction.mockResolvedValue(mockPrediction);

    const result = await service.placePrediction('user-123', MARKET_ID, 1, 50);

    expect(predRepoMock.placePrediction).toHaveBeenCalledWith({
      userId: 'user-123',
      marketId: MARKET_ID,
      outcomeId: 1,
      confidence: 50,
    });
    expect(result).toEqual(mockPrediction);
  });

  it('throws DUPLICATE_PREDICTION if user already predicted', async () => {
    marketRepoMock.findById.mockResolvedValue(openMarket);
    predRepoMock.findByUserAndMarket.mockResolvedValue(mockPrediction);

    await expect(service.placePrediction('user-123', MARKET_ID, 1, 50))
      .rejects.toThrow('DUPLICATE_PREDICTION');
  });

  it('throws if market not found', async () => {
    marketRepoMock.findById.mockResolvedValue(null);

    await expect(service.placePrediction('user-123', MARKET_ID, 1, 50))
      .rejects.toThrow('Market not found');
  });

  it('throws if market is not OPEN', async () => {
    marketRepoMock.findById.mockResolvedValue({ ...openMarket, status: 'CLOSED' });

    await expect(service.placePrediction('user-123', MARKET_ID, 1, 50))
      .rejects.toThrow('Market is not open for predictions');
  });

  it('throws if market closingAt has passed', async () => {
    marketRepoMock.findById.mockResolvedValue({
      ...openMarket,
      closingAt: new Date(Date.now() - 1000),
    });

    await expect(service.placePrediction('user-123', MARKET_ID, 1, 50))
      .rejects.toThrow('Market is not open for predictions');
  });
});
