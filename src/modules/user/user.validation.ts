import { z } from "zod";

const updateProfileValidationSchema = z.object({
	name: z.string().min(2).max(100).optional(),
	headline: z.string().max(200).optional(),
	resumeUrl: z.url("Invalid URL").optional().or(z.literal("")),
	skills: z.array(z.string()).optional(),
});

export const userValidation = {
	updateProfileValidationSchema,
};
