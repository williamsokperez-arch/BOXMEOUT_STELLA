// backend/src/services/cron.service.ts
// Scheduled background jobs for market lifecycle automation.

import cron from 'node-cron';
import { leaderboardService } from './leaderboard.service.js';
import { MarketService } from './market.service.js';
import { oracleService } from './blockchain/oracle.js';
import { marketBlockchainService } from './blockchain/market.js';
import { MarketRepository } from '../repositories/index.js';
import { NotificationRepository } from '../repositories/notification.repository.js';
import { PredictionRepository } from '../repositories/prediction.repository.js';
import { PredictionStatus } from '@prisma/client';
import { logger } from '../utils/logger.js';

/** How long (ms) a DISPUTED market must sit before it is finalized on-chain. */
const DISPUTE_WINDOW_MS = Number(
  process.env.DISPUTE_WINDOW_MS ?? 24 * 60 * 60 * 1000 // 24 h default
);

/** Notifications older than this many days are purged. */
const NOTIFICATION_EXPIRY_DAYS = 90;

export class CronService {
  private marketRepository: MarketRepository;
  private marketService: MarketService;
  private notificationRepository: NotificationRepository;
  private predictionRepository: PredictionRepository;

  constructor(
    marketRepo?: MarketRepository,
    marketSvc?: MarketService,
    notificationRepo?: NotificationRepository,
    predictionRepo?: PredictionRepository
  ) {
    this.marketRepository = marketRepo ?? new MarketRepository();
    this.marketService = marketSvc ?? new MarketService();
    this.notificationRepository =
      notificationRepo ?? new NotificationRepository();
    this.predictionRepository = predictionRepo ?? new PredictionRepository();
  }

  // ---------------------------------------------------------------------------
  // Scheduler bootstrap
  // ---------------------------------------------------------------------------

  async initialize() {
    logger.info('Initializing scheduled jobs');

    // Weekly Ranking Reset: Every Monday at 00:00 UTC
    cron.schedule('0 0 * * 1', async () => {
      logger.info('Running weekly leaderboard reset job');
      await leaderboardService.resetWeeklyRankings();
    });

    // Rank Recalculation: Every hour
    cron.schedule('0 * * * *', async () => {
      logger.info('Running hourly rank recalculation job');
      await leaderboardService.calculateRanks();
    });

    // Oracle Consensus Polling: Every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.pollOracleConsensus();
    });

    // Close expired betting windows: Every minute
    cron.schedule('* * * * *', async () => {
      await this.closeBetting();
    });

    // Finalize disputed markets past their window: Every minute
    cron.schedule('* * * * *', async () => {
      await this.finalizeResolution();
    });

    // Settle predictions for resolved markets: Every minute
    cron.schedule('* * * * *', async () => {
      await this.settlePredictions();
    });

    // Expire old notifications: Daily at 03:00 UTC
    cron.schedule('0 3 * * *', async () => {
      await this.expireNotifications();
    });

    logger.info('Scheduled jobs initialized successfully');
  }

  // ---------------------------------------------------------------------------
  // Job: Close betting
  // Every minute — find OPEN markets whose closingAt has passed; set CLOSED.
  // ---------------------------------------------------------------------------

  async closeBetting(): Promise<void> {
    logger.info('Cron[closeBetting]: start');

    let markets;
    try {
      markets = await this.marketRepository.findExpiredOpenMarkets();
    } catch (error) {
      logger.error('Cron[closeBetting]: failed to fetch expired markets', {
        error,
      });
      return;
    }

    if (markets.length === 0) {
      logger.info('Cron[closeBetting]: no expired open markets');
      return;
    }

    logger.info(`Cron[closeBetting]: closing ${markets.length} market(s)`);

    for (const market of markets) {
      try {
        await this.marketService.closeMarket(market.id);
        logger.info(`Cron[closeBetting]: closed market ${market.id}`);
      } catch (error) {
        logger.error(
          `Cron[closeBetting]: failed to close market ${market.id}`,
          { error, marketId: market.id }
        );
        // Continue — do not let one failure block the rest
      }
    }

    logger.info('Cron[closeBetting]: complete');
  }

  // ---------------------------------------------------------------------------
  // Job: Finalize resolution
  // Every minute — find DISPUTED markets past the dispute window;
  // call finalize_resolution on-chain then mark RESOLVED in DB.
  // ---------------------------------------------------------------------------

  async finalizeResolution(): Promise<void> {
    logger.info('Cron[finalizeResolution]: start');

    let markets;
    try {
      markets =
        await this.marketRepository.findDisputedMarketsReadyToFinalize(
          DISPUTE_WINDOW_MS
        );
    } catch (error) {
      logger.error(
        'Cron[finalizeResolution]: failed to fetch disputed markets',
        { error }
      );
      return;
    }

    if (markets.length === 0) {
      logger.info(
        'Cron[finalizeResolution]: no disputed markets ready to finalize'
      );
      return;
    }

    logger.info(
      `Cron[finalizeResolution]: finalizing ${markets.length} market(s)`
    );

    for (const market of markets) {
      try {
        // Call finalize_resolution on-chain (resolve_market on the contract)
        await marketBlockchainService.resolveMarket(market.contractAddress);

        // Persist the resolution in the DB — winningOutcome already set when
        // the market was originally resolved before the dispute was raised.
        const winningOutcome = market.winningOutcome ?? 0;
        await this.marketService.resolveMarket(
          market.id,
          winningOutcome,
          'finalize-resolution'
        );

        logger.info(`Cron[finalizeResolution]: finalized market ${market.id}`, {
          winningOutcome,
        });
      } catch (error) {
        logger.error(
          `Cron[finalizeResolution]: failed to finalize market ${market.id}`,
          { error, marketId: market.id }
        );
      }
    }

    logger.info('Cron[finalizeResolution]: complete');
  }

  // ---------------------------------------------------------------------------
  // Job: Settle predictions
  // Every minute — find RESOLVED markets that still have REVEALED predictions;
  // settle each prediction directly (idempotent — already-SETTLED rows are
  // skipped by the REVEALED filter in the repository query).
  // ---------------------------------------------------------------------------

  async settlePredictions(): Promise<void> {
    logger.info('Cron[settlePredictions]: start');

    let markets;
    try {
      markets =
        await this.marketRepository.findResolvedMarketsWithUnsettledPredictions();
    } catch (error) {
      logger.error(
        'Cron[settlePredictions]: failed to fetch resolved markets',
        { error }
      );
      return;
    }

    if (markets.length === 0) {
      logger.info('Cron[settlePredictions]: no unsettled predictions found');
      return;
    }

    logger.info(
      `Cron[settlePredictions]: processing ${markets.length} market(s)`
    );

    for (const market of markets) {
      if (
        market.winningOutcome === null ||
        market.winningOutcome === undefined
      ) {
        logger.warn(
          `Cron[settlePredictions]: market ${market.id} has no winningOutcome — skipping`
        );
        continue;
      }

      try {
        const predictions =
          await this.predictionRepository.findMarketPredictions(market.id);

        let settled = 0;
        for (const prediction of predictions) {
          if (prediction.status === PredictionStatus.SETTLED) continue;

          const isWinner =
            prediction.predictedOutcome === market.winningOutcome;
          const pnlUsd = isWinner
            ? Number(prediction.amountUsdc) * 0.9
            : -Number(prediction.amountUsdc);

          await this.predictionRepository.settlePrediction(
            prediction.id,
            isWinner,
            pnlUsd
          );
          settled++;

          // Fire-and-forget achievement check after settlement
          import('./achievement.service.js').then(({ achievementService }) =>
            achievementService.checkAndAward(prediction.userId, 'prediction_settled')
          ).catch(() => {});
        }

        logger.info(
          `Cron[settlePredictions]: settled ${settled} prediction(s) for market ${market.id}`
        );
      } catch (error) {
        logger.error(
          `Cron[settlePredictions]: failed to settle predictions for market ${market.id}`,
          { error, marketId: market.id }
        );
      }
    }

    logger.info('Cron[settlePredictions]: complete');
  }

  // ---------------------------------------------------------------------------
  // Job: Expire notifications
  // Daily — delete notifications older than NOTIFICATION_EXPIRY_DAYS.
  // ---------------------------------------------------------------------------

  async expireNotifications(): Promise<void> {
    logger.info('Cron[expireNotifications]: start');

    try {
      const deleted =
        await this.notificationRepository.deleteExpiredNotifications(
          NOTIFICATION_EXPIRY_DAYS
        );
      logger.info(
        `Cron[expireNotifications]: deleted ${deleted} notification(s)`,
        {
          olderThanDays: NOTIFICATION_EXPIRY_DAYS,
        }
      );
    } catch (error) {
      logger.error('Cron[expireNotifications]: failed', { error });
    }

    logger.info('Cron[expireNotifications]: complete');
  }

  // ---------------------------------------------------------------------------
  // Existing job: Oracle consensus polling
  // ---------------------------------------------------------------------------

  async pollOracleConsensus() {
    logger.info('Running oracle consensus polling job');

    let markets;
    try {
      markets =
        await this.marketRepository.getClosedMarketsAwaitingResolution();
    } catch (error) {
      logger.error('Oracle polling: failed to fetch closed markets', { error });
      return;
    }

    if (markets.length === 0) {
      logger.info('Oracle polling: no CLOSED markets awaiting resolution');
      return;
    }

    logger.info(
      `Oracle polling: checking consensus for ${markets.length} market(s)`
    );

    for (const market of markets) {
      try {
        const winningOutcome = await oracleService.checkConsensus(market.id);

        if (winningOutcome === null) {
          logger.info(
            `Oracle polling: no consensus yet for market ${market.id}`
          );
          continue;
        }

        logger.info(
          `Oracle polling: consensus reached for market ${market.id}`,
          { winningOutcome }
        );

        const resolved = await this.marketService.resolveMarket(
          market.id,
          winningOutcome,
          'oracle-consensus'
        );

        logger.info(
          `Oracle polling: market ${market.id} resolved successfully`,
          { winningOutcome, resolvedAt: resolved.resolvedAt }
        );
      } catch (error) {
        logger.error(`Oracle polling: failed to process market ${market.id}`, {
          error,
          marketId: market.id,
        });
      }
    }
  }
}

export const cronService = new CronService();
