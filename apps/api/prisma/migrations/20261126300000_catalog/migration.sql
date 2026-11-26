-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "option_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_value" (
    "id" TEXT NOT NULL,
    "optionTypeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "option_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "price" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OptionTypeToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OptionTypeToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_OptionValueToVariant" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OptionValueToVariant_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_name_key" ON "category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "option_type_name_key" ON "option_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "option_value_optionTypeId_value_key" ON "option_value"("optionTypeId", "value");

-- CreateIndex
CREATE INDEX "product_categoryId_idx" ON "product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_sku_key" ON "variant"("sku");

-- CreateIndex
CREATE INDEX "variant_productId_idx" ON "variant"("productId");

-- CreateIndex
CREATE INDEX "_OptionTypeToProduct_B_index" ON "_OptionTypeToProduct"("B");

-- CreateIndex
CREATE INDEX "_OptionValueToVariant_B_index" ON "_OptionValueToVariant"("B");

-- AddForeignKey
ALTER TABLE "option_value" ADD CONSTRAINT "option_value_optionTypeId_fkey" FOREIGN KEY ("optionTypeId") REFERENCES "option_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant" ADD CONSTRAINT "variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OptionTypeToProduct" ADD CONSTRAINT "_OptionTypeToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "option_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OptionTypeToProduct" ADD CONSTRAINT "_OptionTypeToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OptionValueToVariant" ADD CONSTRAINT "_OptionValueToVariant_A_fkey" FOREIGN KEY ("A") REFERENCES "option_value"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OptionValueToVariant" ADD CONSTRAINT "_OptionValueToVariant_B_fkey" FOREIGN KEY ("B") REFERENCES "variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added: amounts and Stock never go negative, whatever writes them (ADR 0002).
ALTER TABLE "product" ADD CONSTRAINT "product_price_check" CHECK ("price" >= 0);
ALTER TABLE "variant" ADD CONSTRAINT "variant_price_check" CHECK ("price" >= 0);
ALTER TABLE "variant" ADD CONSTRAINT "variant_stock_check" CHECK ("stock" >= 0);
