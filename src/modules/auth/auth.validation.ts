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

const EmailVerificationZodSchema = z.object({
	email: z.email("Email must be a proper email"),
	otp: z.string().length(6, "OTP must be 6 digits"),
});

const googleLoginValidationSchema = z
	.object({
		idToken: z.string().min(1, "idToken is required"),
		role: z.enum(["CANDIDATE", "COMPANY_OWNER"]).optional(),
		companyName: z.string().min(2).max(255).optional(),
	})
	.refine((data) => data.role !== "COMPANY_OWNER" || !!data.companyName, {
		message: "companyName is required when registering as a Company Owner",
		path: ["companyName"],
	});

const refreshTokenValidationSchema = z.object({
	refreshToken: z.string().optional(),
});

const forgotPasswordValidationSchema = z.object({
	email: z.email("Invalid email"),
});

const resetPasswordValidationSchema = z.object({
	email: z.email("Invalid email"),
	otp: z.string().length(6, "OTP must be 6 digits"),
	newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const authValidation = {
	registerValidationSchema,
	loginValidationSchema,
	EmailVerificationZodSchema,
	googleLoginValidationSchema,
	refreshTokenValidationSchema,
	forgotPasswordValidationSchema,
	resetPasswordValidationSchema,
};
