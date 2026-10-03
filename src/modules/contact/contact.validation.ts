import { z } from "zod";

const sendContactMessageValidationSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "Name must be at least 2 characters")
		.max(100, "Name must be at most 100 characters"),
	email: z.email("Invalid email"),
	subject: z
		.string()
		.trim()
		.min(3, "Subject must be at least 3 characters")
		.max(150, "Subject must be at most 150 characters"),
	message: z
		.string()
		.trim()
		.min(10, "Message must be at least 10 characters")
		.max(2000, "Message must be at most 2000 characters"),
});

export const contactValidation = {
	sendContactMessageValidationSchema,
};
