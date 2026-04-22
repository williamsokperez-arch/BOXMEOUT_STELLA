import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ message: err.message, statusCode: err.statusCode, details: err.details });
    }
    res.status(err.statusCode).json({
      error: {
        code: err.statusCode,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error({ message, stack: err instanceof Error ? err.stack : undefined });

  res.status(500).json({
    error: {
      code: 500,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    },
  });
}
