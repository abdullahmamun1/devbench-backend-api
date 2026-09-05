-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "selectedOptionId" TEXT;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "McqOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
