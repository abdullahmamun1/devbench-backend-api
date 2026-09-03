import { z } from "zod";

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

export const companyValidation = {
	createCompanyValidationSchema,
	inviteTeamMemberValidationSchema,
	updateCompanyValidationSchema,
};
