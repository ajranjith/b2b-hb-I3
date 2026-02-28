-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "height" DECIMAL(65,30),
ADD COLUMN     "length" DECIMAL(65,30),
ADD COLUMN     "supplierCode" TEXT,
ADD COLUMN     "weight" DECIMAL(65,30),
ADD COLUMN     "width" DECIMAL(65,30);

-- CreateIndex
CREATE INDEX "Product_supplierCode_idx" ON "Product"("supplierCode");
