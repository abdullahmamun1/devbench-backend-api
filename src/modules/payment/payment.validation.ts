import { z } from "zod";

// Fixed price per credit — the company picks
// how many credits, the price is derived server-side.
const createSessionValidationSchema = z.object({
	credits: z
		.number()
		.int()
		.positive("Credits must be a positive integer")
		.max(1000, "Cannot purchase more than 1000 credits in a single session"),
});

export const paymentValidation = {
	createSessionValidationSchema,
};
