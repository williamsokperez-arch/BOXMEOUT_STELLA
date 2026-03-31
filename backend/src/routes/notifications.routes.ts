import { Router } from 'express';
import {
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationPreferences,
  getNotificationPreferences,
} from '../controllers/notifications.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications (paginated, newest first)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Paginated list of notifications
 *         headers:
 *           X-Unread-Count:
 *             schema:
 *               type: integer
 *             description: Number of unread notifications
 *       401:
 *         description: Unauthorized
 */
router.get('/', requireAuth, getUserNotifications);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 *       401:
 *         description: Unauthorized
 */
router.get('/unread-count', requireAuth, getUnreadCount);

/**
 * @swagger
 * /api/notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences
 *       401:
 *         description: Unauthorized
 */
router.get('/preferences', requireAuth, getNotificationPreferences);

/**
 * @swagger
 * /api/notifications/preferences:
 *   patch:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences updated
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notifyPredictionResult:
 *                 type: boolean
 *               notifyMarketResolution:
 *                 type: boolean
 *               notifyWinnings:
 *                 type: boolean
 *               notifyAchievements:
 *                 type: boolean
 *               notifyTradeFilled:
 *                 type: boolean
 *               emailNotifications:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifyPredictionResult:
 *                       type: boolean
 *                     notifyMarketResolution:
 *                       type: boolean
 *                     notifyWinnings:
 *                       type: boolean
 *                     notifyAchievements:
 *                       type: boolean
 *                     notifyTradeFilled:
 *                       type: boolean
 *                     emailNotifications:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 */
router.patch('/preferences', requireAuth, updateNotificationPreferences);
router.put('/preferences', requireAuth, updateNotificationPreferences);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all unread notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         headers:
 *           X-Unread-Count:
 *             schema:
 *               type: integer
 *       401:
 *         description: Unauthorized
 */
router.patch('/read-all', requireAuth, markAllNotificationsRead);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         headers:
 *           X-Unread-Count:
 *             schema:
 *               type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read', requireAuth, markNotificationRead);

// Legacy PUT aliases for backward compatibility
router.put('/read-all', requireAuth, markAllNotificationsRead);
router.put('/:notificationId/read', requireAuth, (req, res, next) => {
  req.params.id = req.params.notificationId;
  next();
}, markNotificationRead);

export default router;
