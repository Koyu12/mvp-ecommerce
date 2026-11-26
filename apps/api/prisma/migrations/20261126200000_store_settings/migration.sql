-- CreateTable
CREATE TABLE "store_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shippingFee" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id"),
    -- Single-row table.
    CONSTRAINT "store_settings_single_row" CHECK ("id" = 1)
);

-- Default Shipping fee: Rp15.000.
INSERT INTO "store_settings" ("id", "shippingFee", "updatedAt") VALUES (1, 15000, CURRENT_TIMESTAMP);
