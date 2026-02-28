/*
  Warnings:

  - The values [CREATED,READY_FOR_SHIPMENT,FULLFILLED,CANCELLED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('BACKORDER', 'PICKING', 'PACKING', 'OUT_FOR_DELIVERY', 'PROCESSING');
ALTER TABLE "public"."Order" ALTER COLUMN "orderStatus" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "orderStatus" TYPE "OrderStatus_new" USING ("orderStatus"::text::"OrderStatus_new");
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "oldStatus" TYPE "OrderStatus_new" USING ("oldStatus"::text::"OrderStatus_new");
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "newStatus" TYPE "OrderStatus_new" USING ("newStatus"::text::"OrderStatus_new");
ALTER TABLE "OrderStatusLog" ALTER COLUMN "orderStatus" TYPE "OrderStatus_new" USING ("orderStatus"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "orderStatus" SET DEFAULT 'PROCESSING';
COMMIT;
