import { z } from "zod";

const submitAnswerValidationSchema = z.object({
	problemId: z.uuid("Invalid problem ID"),
	selectedOptionId: z.uuid("Invalid option ID").optional(),
	answerText: z.string().max(10000).optional(),
	code: z.string().max(50000).optional(),
	language: z.string().max(50).optional(),
});

// The exam screen batches integrity events and sends them every few seconds.
const recordEventsValidationSchema = z.object({
	events: z
		.array(
			z.object({
				type: z.enum(["TAB_HIDDEN", "TAB_VISIBLE", "PASTE", "QUESTION_VIEWED"]),
				problemId: z.uuid("Invalid problem ID").optional(),
				occurredAt: z.iso.datetime("occurredAt must be an ISO date"),
				// PASTE only: how many characters were pasted
				chars: z.number().int().min(0).max(1_000_000).optional(),
			}),
		)
		.min(1, "Send at least one event")
		.max(50, "Send at most 50 events per request"),
});

export const attemptValidation = {
	submitAnswerValidationSchema,
	recordEventsValidationSchema,
};
