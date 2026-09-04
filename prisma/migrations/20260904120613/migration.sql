/*
  Warnings:

  - The `provider` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('CREDENTIALS', 'GOOGLE');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "provider",
ADD COLUMN     "provider" "AuthProvider" NOT NULL DEFAULT 'CREDENTIALS';

-- DropEnum
DROP TYPE "AuthProvier";
