-- AlterTable
ALTER TABLE "order" ADD COLUMN     "courier" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "trackingNumber" TEXT;
