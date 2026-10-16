import { z } from "zod";

const share = z.coerce
	.number()
	.int("Use whole percentages")
	.min(0, "A share can't be negative")
	.max(100, "A share can't be above 100");

// Query string of GET /insights/assessments/:id/suggestions
const suggestionsQuerySchema = z
	.object({
		minutes: z.coerce
			.number()
			.int("Use whole minutes")
			.min(5, "Plan at least 5 minutes")
			.max(600, "Plan at most 600 minutes")
			.optional(),
		coding: share.default(50),
		mcq: share.default(30),
		written: share.default(20),
		difficulty: z.enum(["easier", "balanced", "harder"]).default("balanced"),
	})
	.refine((q) => q.coding + q.mcq + q.written > 0, {
		message: "Give at least one problem type a share of the time",
	});

export const insightsValidation = {
	suggestionsQuerySchema,
};
