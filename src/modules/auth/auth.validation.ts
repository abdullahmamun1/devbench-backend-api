import { z } from "zod";

const registerValidationSchema = z
	.object({
		name: z.string().min(2, "Name must be at least 2 characters").max(100),
		email: z.email("Invalid email address"),
		password: z
			.string()
			.min(6, "Password must be at least 6 characters")
			.max(100),
		role: z.enum(["CANDIDATE", "COMPANY_OWNER"]).default("CANDIDATE"),
		companyName: z.string().min(2).max(100).optional(),
	})
	.refine(
		(data) => {
			if (data.role === "COMPANY_OWNER" && !data.companyName) {
				return false;
			}
			return true;
		},
		{
			message: "Company name is required when registering as a Company Owner",
			path: ["companyName"],
		},
	);

const loginValidationSchema = z.object({
	email: z.email("Invalid email address"),
	password: z.string().min(1, "Password is required"),
});

const refreshTokenValidationSchema = z.object({
	refreshToken: z.string().optional(),
});

export const authValidation = {
	registerValidationSchema,
	loginValidationSchema,
	refreshTokenValidationSchema,
};
