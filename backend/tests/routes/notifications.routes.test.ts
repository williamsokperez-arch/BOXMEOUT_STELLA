import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import notificationsRoutes from '../../src/routes/notifications.routes.js';
import { notificationService } from '../../src/services/notification.service.js';

vi.mock('../../src/services/notification.service.js', () => ({
  notificationService: {
    getUserNotifications: vi.fn(),
    countUserNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    updateNotificationPreferences: vi.fn(),
  },
}));

vi.mock('../../src/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'test-user-123', publicKey: 'test-key' };
    next();
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/repositories/user.repository.js', () => ({
  UserRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn().mockResolvedValue({
      id: 'test-user-123',
      notifyPredictionResult: true,
      notifyMarketResolution: true,
      notifyWinnings: true,
      notifyAchievements: true,
      emailNotifications: false,
    }),
  })),
}));

const mockNotification = {
  id: 'notif-123',
  userId: 'test-user-123',
  type: 'PREDICTION_RESULT',
  title: 'Test',
  message: 'Test message',
  isRead: false,
  createdAt: new Date().toISOString(),
};

describe('Notifications Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationsRoutes);
  });

  describe('GET /api/notifications', () => {
    it('returns paginated notifications with X-Unread-Count header', async () => {
      vi.mocked(notificationService.getUserNotifications).mockResolvedValue([mockNotification] as any);
      vi.mocked(notificationService.countUserNotifications).mockResolvedValue(1);
      vi.mocked(notificationService.getUnreadCount).mockResolvedValue(1);

      const res = await request(app).get('/api/notifications');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 1 });
      expect(res.headers['x-unread-count']).toBe('1');
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith('test-user-123', 20, 0);
    });

    it('respects page and limit query params', async () => {
      vi.mocked(notificationService.getUserNotifications).mockResolvedValue([] as any);
      vi.mocked(notificationService.countUserNotifications).mockResolvedValue(0);
      vi.mocked(notificationService.getUnreadCount).mockResolvedValue(0);

      await request(app).get('/api/notifications?page=2&limit=10');

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith('test-user-123', 10, 10);
    });

    it('returns 500 on service error', async () => {
      vi.mocked(notificationService.getUserNotifications).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/notifications');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Failed to retrieve notifications');
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    it('marks a notification as read and returns X-Unread-Count', async () => {
      vi.mocked(notificationService.getUserNotifications).mockResolvedValue([mockNotification] as any);
      vi.mocked(notificationService.markRead).mockResolvedValue({ ...mockNotification, isRead: true } as any);
      vi.mocked(notificationService.getUnreadCount).mockResolvedValue(0);

      const res = await request(app).patch('/api/notifications/notif-123/read');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isRead).toBe(true);
      expect(res.headers['x-unread-count']).toBe('0');
      expect(notificationService.markRead).toHaveBeenCalledWith('notif-123');
    });

    it('returns 404 when notification not found', async () => {
      vi.mocked(notificationService.getUserNotifications).mockResolvedValue([] as any);

      const res = await request(app).patch('/api/notifications/notif-999/read');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Notification not found');
    });

    it('returns 500 on service error', async () => {
      vi.mocked(notificationService.getUserNotifications).mockRejectedValue(new Error('DB error'));

      const res = await request(app).patch('/api/notifications/notif-123/read');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    it('marks all notifications as read and sets X-Unread-Count to 0', async () => {
      vi.mocked(notificationService.markAllRead).mockResolvedValue(5);

      const res = await request(app).patch('/api/notifications/read-all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.markedCount).toBe(5);
      expect(res.headers['x-unread-count']).toBe('0');
      expect(notificationService.markAllRead).toHaveBeenCalledWith('test-user-123');
    });

    it('returns 500 on service error', async () => {
      vi.mocked(notificationService.markAllRead).mockRejectedValue(new Error('DB error'));

      const res = await request(app).patch('/api/notifications/read-all');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
