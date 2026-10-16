import { z } from "zod";

// Emails are stored and looked up lower-cased, so "Jane@Acme.com" and
// "jane@acme.com" are the same account everywhere.
const normalizedEmail = (message: string) =>
	z.string().trim().toLowerCase().pipe(z.email(message));

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

const registerValidationSchema = z
	.object({
		name: z.string().min(2, "Name must be at least 2 characters").max(100),
		email: normalizedEmail("Invalid email address"),
		password: strongPassword,
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
	email: normalizedEmail("Invalid email address"),
	password: z.string().min(1, "Password is required"),
});

const EmailVerificationZodSchema = z.object({
	email: normalizedEmail("Email must be a proper email"),
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
	email: normalizedEmail("Invalid email"),
});

const resetPasswordValidationSchema = z.object({
	email: normalizedEmail("Invalid email"),
	otp: z.string().length(6, "OTP must be 6 digits"),
	newPassword: strongPassword,
});

const resendOtpValidationSchema = z.object({
	email: normalizedEmail("Invalid email"),
});

export const authValidation = {
	resendOtpValidationSchema,
	registerValidationSchema,
	loginValidationSchema,
	EmailVerificationZodSchema,
	googleLoginValidationSchema,
	refreshTokenValidationSchema,
	forgotPasswordValidationSchema,
	resetPasswordValidationSchema,
};
