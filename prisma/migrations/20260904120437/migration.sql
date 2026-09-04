/*
  Warnings:

  - The `provider` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AuthProvier" AS ENUM ('CREDENTIALS', 'GOOGLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "provider",
ADD COLUMN     "provider" "AuthProvier" NOT NULL DEFAULT 'CREDENTIALS';
