import { z } from "zod";

const creditAdjustValidationSchema = z.object({
	companyId: z.uuid("Invalid company ID"),
	amount: z
		.number()
		.int()
		.refine((val) => val !== 0, "Amount cannot be zero"),
	reason: z
		.string()
		.min(5, "A reason is required for manual credit adjustments")
		.max(500),
});

export const adminValidation = {
	creditAdjustValidationSchema,
};
