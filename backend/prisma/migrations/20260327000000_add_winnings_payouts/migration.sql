-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "winnings_payouts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "winnings_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "winnings_payouts_user_id_market_id_key" ON "winnings_payouts"("user_id", "market_id");

-- CreateIndex
CREATE INDEX "winnings_payouts_user_id_idx" ON "winnings_payouts"("user_id");

-- CreateIndex
CREATE INDEX "winnings_payouts_market_id_idx" ON "winnings_payouts"("market_id");

-- CreateIndex
CREATE INDEX "winnings_payouts_status_idx" ON "winnings_payouts"("status");

-- AddForeignKey
ALTER TABLE "winnings_payouts" ADD CONSTRAINT "winnings_payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "winnings_payouts" ADD CONSTRAINT "winnings_payouts_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
