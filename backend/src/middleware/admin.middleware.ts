import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const adminAddresses = (process.env.ADMIN_WALLET_ADDRESSES || '')
      .split(',')
      .filter(Boolean);

    if (
      !req.user.publicKey ||
      !adminAddresses.includes(req.user.publicKey)
    ) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
      return;
    }

    next();
  } catch (error) {
    (req.log || logger).error('Admin middleware error', { error });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Authorization failed' },
    });
  }
}
