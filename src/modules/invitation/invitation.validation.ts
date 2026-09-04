import { z } from "zod";

const createInvitationValidationSchema = z.object({
	candidateEmail: z.email("Invalid email"),
});

// name/password are optional at the schema level because an already-logged-in
// candidate accepts with an empty body. The service layer enforces them as
// required when there's no authenticated user on the request.
const acceptInvitationValidationSchema = z.object({
	name: z
		.string()
		.min(2, "Name must be at least 2 characters")
		.max(255)
		.optional(),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.optional(),
});

export const invitationValidation = {
	createInvitationValidationSchema,
	acceptInvitationValidationSchema,
};
