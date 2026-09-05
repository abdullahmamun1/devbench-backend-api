import { z } from "zod";

const submitAnswerValidationSchema = z.object({
	problemId: z.uuid("Invalid problem ID"),
	selectedOptionId: z.uuid("Invalid option ID").optional(),
	answerText: z.string().max(10000).optional(),
	code: z.string().max(50000).optional(),
	language: z.string().max(50).optional(),
});

export const attemptValidation = {
	submitAnswerValidationSchema,
};
