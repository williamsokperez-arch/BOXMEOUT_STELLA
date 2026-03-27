// Notification repository - data access layer for notifications
import { Notification, NotificationType } from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';

export class NotificationRepository extends BaseRepository<Notification> {
  getModelName(): string {
    return 'notification';
  }

  async createNotification(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: any;
  }): Promise<Notification> {
    try {
      return await this.prisma.notification.create({ data });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findByUserId(userId: string, limit: number = 20): Promise<Notification[]> {
    try {
      return await this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async markAsRead(notificationId: string): Promise<Notification> {
    try {
      return await this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
      return result.count;
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({ where: { userId, isRead: false } });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
