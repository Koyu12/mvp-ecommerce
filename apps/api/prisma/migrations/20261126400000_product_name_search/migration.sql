-- Storefront name search uses ILIKE; a trigram GIN index serves it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "product_name_idx" ON "product" USING GIN ("name" gin_trgm_ops);
