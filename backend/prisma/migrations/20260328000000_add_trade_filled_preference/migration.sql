-- AlterTable
ALTER TABLE "users" ADD COLUMN "notify_trade_filled" BOOLEAN NOT NULL DEFAULT true;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TRADE_FILLED';
