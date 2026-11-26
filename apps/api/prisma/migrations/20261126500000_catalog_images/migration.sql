-- AlterTable
ALTER TABLE "product" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "variant" ADD COLUMN     "image" TEXT;
