import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger.js';

/**
 * GET /notifications — paginated, newest first, with X-Unread-Count header
 */
export async function getUserNotifications(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const offset = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      notificationService.getUserNotifications(userId, limit, offset),
      notificationService.countUserNotifications(userId),
      notificationService.getUnreadCount(userId),
    ]);

    res.setHeader('X-Unread-Count', String(unreadCount));
    res.json({
      success: true,
      data: notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Failed to get user notifications', { error });
    res.status(500).json({ success: false, error: 'Failed to retrieve notifications' });
  }
}

/**
 * GET /notifications/unread-count
 */
export async function getUnreadCount(req: AuthenticatedRequest, res: Response) {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    logger.error('Failed to get unread count', { error });
    res.status(500).json({ success: false, error: 'Failed to retrieve unread count' });
  }
}

/**
 * PATCH /notifications/:id/read — mark single notification as read
 */
export async function markNotificationRead(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const notificationId = req.params.id;

    const notifications = await notificationService.getUserNotifications(userId, 1000);
    const notification = notifications.find((n) => n.id === notificationId);

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    const updated = await notificationService.markRead(notificationId);
    const unreadCount = await notificationService.getUnreadCount(userId);

    res.setHeader('X-Unread-Count', String(unreadCount));
    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error });
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
}

/**
 * PATCH /notifications/read-all — mark all unread notifications as read
 */
export async function markAllNotificationsRead(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const count = await notificationService.markAllRead(userId);

    res.setHeader('X-Unread-Count', '0');
    res.json({ success: true, data: { markedCount: count } });
  } catch (error) {
    logger.error('Failed to mark all notifications as read', { error });
    res.status(500).json({ success: false, error: 'Failed to mark all notifications as read' });
  }
}

/**
 * GET /notifications/preferences
 */
export async function getNotificationPreferences(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const { UserRepository } = await import('../repositories/user.repository.js');
    const user = await new UserRepository().findById(req.user!.userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const userId = req.user!.userId;
    const {
      notifyPredictionResult,
      notifyMarketResolution,
      notifyWinnings,
      notifyAchievements,
      notifyTradeFilled,
      emailNotifications,
    } = req.body;

    const user = await notificationService.updateNotificationPreferences(
      userId,
      {
        notifyPredictionResult,
        notifyMarketResolution,
        notifyWinnings,
        notifyAchievements,
        notifyTradeFilled,
        emailNotifications,
      }
    );

    res.json({
      success: true,
      data: {
        notifyPredictionResult: user.notifyPredictionResult,
        notifyMarketResolution: user.notifyMarketResolution,
        notifyWinnings: user.notifyWinnings,
        notifyAchievements: user.notifyAchievements,
        notifyTradeFilled: user.notifyTradeFilled,
        emailNotifications: user.emailNotifications,
      },
    });
  } catch (error) {
    logger.error('Failed to get notification preferences', { error });
    res.status(500).json({ success: false, error: 'Failed to retrieve notification preferences' });
  }
}

/**
 * PUT /notifications/preferences
 */
export async function updateNotificationPreferences(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const {
      notifyPredictionResult,
      notifyMarketResolution,
      notifyWinnings,
      notifyAchievements,
      emailNotifications,
    } = req.body;

    const user = await notificationService.updateNotificationPreferences(req.user!.userId, {
      notifyPredictionResult,
      notifyMarketResolution,
      notifyWinnings,
      notifyAchievements,
      emailNotifications,
    });

    res.json({
      success: true,
      data: {
        notifyPredictionResult: user.notifyPredictionResult,
        notifyMarketResolution: user.notifyMarketResolution,
        notifyWinnings: user.notifyWinnings,
        notifyAchievements: user.notifyAchievements,
        notifyTradeFilled: user.notifyTradeFilled,
        emailNotifications: user.emailNotifications,
      },
    });
  } catch (error) {
    logger.error('Failed to update notification preferences', { error });
    res.status(500).json({ success: false, error: 'Failed to update notification preferences' });
  }
}
