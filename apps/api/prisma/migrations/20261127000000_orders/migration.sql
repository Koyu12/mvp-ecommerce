-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'paid', 'shipped', 'completed', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "subtotal" INTEGER NOT NULL,
    "shippingFee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "options" TEXT[],
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("orderId","position")
);

-- CreateTable
CREATE TABLE "order_number_sequence" (
    "day" TEXT NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "order_number_sequence_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_number_key" ON "order"("number");

-- CreateIndex
CREATE INDEX "order_userId_createdAt_idx" ON "order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_createdAt_idx" ON "order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_userId_idempotencyKey_key" ON "order"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "order_item_variantId_idx" ON "order_item"("variantId");

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money and quantities can't go negative.
ALTER TABLE "order" ADD CONSTRAINT "order_amounts_check" CHECK ("subtotal" >= 0 AND "shippingFee" >= 0 AND "total" >= 0);
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_amounts_check" CHECK ("unitPrice" >= 0 AND "quantity" > 0 AND "lineTotal" >= 0);

