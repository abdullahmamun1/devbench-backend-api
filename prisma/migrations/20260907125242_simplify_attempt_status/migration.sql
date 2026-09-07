/*
  Warnings:

  - The values [NOT_STARTED,EXPIRED] on the enum `AttemptStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [REFUNDED] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AttemptStatus_new" AS ENUM ('IN_PROGRESS', 'SUBMITTED');
ALTER TABLE "public"."Attempt" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Attempt" ALTER COLUMN "status" TYPE "AttemptStatus_new" USING ("status"::text::"AttemptStatus_new");
ALTER TYPE "AttemptStatus" RENAME TO "AttemptStatus_old";
ALTER TYPE "AttemptStatus_new" RENAME TO "AttemptStatus";
DROP TYPE "public"."AttemptStatus_old";
ALTER TABLE "Attempt" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
ALTER TABLE "public"."Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Attempt" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';
