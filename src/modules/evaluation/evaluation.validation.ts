import { z } from "zod";

const gradeSubmissionValidationSchema = z.object({
	score: z.number().int().nonnegative("Score cannot be negative"),
	status: z.enum(["PASSED", "FAILED", "PARTIAL"]),
	feedback: z.string().max(5000).optional(),
});

export const evaluationValidation = {
	gradeSubmissionValidationSchema,
};
