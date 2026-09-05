-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE';
