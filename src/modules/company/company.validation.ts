import { z } from "zod";

const strongPassword = z
	.string()
	.min(8, "Password must be at least 8 characters")
	.max(100)
	.regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
	.regex(/[a-z]/, "Password must contain at least one lowercase letter.")
	.regex(/[0-9]/, "Password must contain at least one number.")
	.regex(
		/[^A-Za-z0-9]/,
		"Password must contain at least one special character.",
	);

const createCompanyValidationSchema = z.object({
	companyName: z
		.string()
		.min(2, "Company name must be at least 2 characters")
		.max(255),
});

const updateCompanyValidationSchema = z.object({
	companyName: z
		.string()
		.min(2, "Company name must be at least 2 characters")
		.max(255)
		.optional(),
});

const inviteTeamMemberValidationSchema = z.object({
	email: z.email("Invalid email"),
	role: z.enum(["ASSESSMENT_CREATOR", "EVALUATOR"]),
});

const acceptTeamInvitationValidationSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "Name must be at least 2 characters")
		.max(100)
		.optional(),
	password: strongPassword.optional(),
});

export const companyValidation = {
	createCompanyValidationSchema,
	inviteTeamMemberValidationSchema,
	updateCompanyValidationSchema,
	acceptTeamInvitationValidationSchema,
};
