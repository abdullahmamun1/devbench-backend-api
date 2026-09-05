import crypto from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import ejs from "ejs";
import type { TokenPayload } from "google-auth-library";
import type { JwtPayload } from "jsonwebtoken";
import { AuthProvider, type Prisma, UserRole } from "../../../generated/prisma";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
import { writeAuditLog } from "../../utils/auditLog";
import { createError } from "../../utils/createError";
import { jwtUtils } from "../../utils/jwt";
import type {
	IForgotPasswordPayload,
	IGoogleLoginPayload,
	ILoginPayload,
	IRegisterPayload,
	IResetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface";

type UserWithCompany = Prisma.UserGetPayload<{ include: { company: true } }>;

const registerUser = async (payload: IRegisterPayload) => {
	const existingUser = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	if (existingUser?.emailVerified) {
		throw createError(409, "An account with this email already exists");
	}
	if (existingUser?.status === "SUSPENDED") {
		throw createError(403, "This account has been suspended");
	}
	if (existingUser?.status === "DELETED") {
		throw createError(403, "This account has been deleted");
	}
	if (payload.role === "COMPANY_OWNER" && !payload.companyName) {
		throw createError(
			400,
			"companyName is required when registering as a Company Owner",
		);
	}

	const passwordHash = await bcrypt.hash(
		payload.password,
		Number(config.bcrypt_salt_rounds) || 12,
	);

	if (existingUser) {
		// Unverified account retrying registration — refresh their credentials,
		// but keep the original role/company; don't let a resend switch account type.
		await prisma.user.update({
			where: { id: existingUser.id },
			data: {
				name: payload.name,
				passwordHash,
			},
		});
	} else {
		await prisma.$transaction(async (tx) => {
			if (payload.role === "COMPANY_OWNER") {
				const company = await tx.company.create({
					data: {
						companyName: payload.companyName!,
						creditBalance: 10,
					},
				});

				return tx.user.create({
					data: {
						name: payload.name,
						email: payload.email,
						passwordHash,
						role: UserRole.COMPANY_OWNER,
						emailVerified: false,
						companyId: company.id,
					},
				});
			}

			const newUser = await tx.user.create({
				data: {
					name: payload.name,
					email: payload.email,
					passwordHash,
					role: UserRole.CANDIDATE,
					emailVerified: false,
				},
			});

			await tx.candidateProfile.create({
				data: { userId: newUser.id, skills: [] },
			});

			return newUser;
		});
	}

	const otpValue = crypto.randomInt(100000, 1000000).toString();
	await redis.set(`register-otp:${payload.email}`, otpValue, {
		ex: Number(config.registration_otp_ttl_seconds),
	});

	const templatePath = path.join(
		process.cwd(),
		"src/templates/registration-otp.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		name: payload.name,
		otp: otpValue,
	});

	await transporter.sendMail({
		from: config.mail_from,
		to: payload.email,
		subject: "Verify your DevBench account",
		html,
	});

	return {
		email: payload.email,
		otpExpiresInSeconds: Number(config.registration_otp_ttl_seconds),
	};
};

const verifyEmail = async (payload: IVerifyEmailPayload) => {
	const email = payload.email.trim().toLowerCase();
	const otp = payload.otp;

	const user = await prisma.user.findUnique({
		where: { email },
		include: { company: true },
	});

	if (!user) {
		throw createError(
			404,
			"No registration found for this email — please register first",
		);
	}
	if (user.emailVerified) {
		throw createError(409, "Email is already verified");
	}
	if (user.status === "SUSPENDED") {
		throw createError(403, "This account has been suspended");
	}
	if (user.status === "DELETED") {
		throw createError(403, "This account has been deleted");
	}

	const otpKey = `register-otp:${email}`;
	const storedOtpRaw = await redis.get(otpKey);
	const storedOtp = storedOtpRaw !== null ? String(storedOtpRaw) : null;

	if (!storedOtp) {
		throw createError(400, "Invalid or expired OTP");
	}
	if (storedOtp !== otp) {
		throw createError(400, "OTP does not match");
	}

	await redis.del(otpKey);

	const verifiedUser = await prisma.user.update({
		where: { id: user.id },
		data: { emailVerified: true },
		include: { company: true },
	});

	const templateFileName =
		verifiedUser.role === "CANDIDATE" ? "candidate-welcome" : "owner-welcome";
	const templatePath = path.join(
		process.cwd(),
		`src/templates/${templateFileName}.ejs`,
	);
	const templateData = {
		name: verifiedUser.name,
		email: verifiedUser.email,
		companyName: verifiedUser.company
			? verifiedUser.company.companyName
			: "Your Company Workspace",
	};

	try {
		const html = await ejs.renderFile(templatePath, templateData);
		await transporter.sendMail({
			from: config.mail_from,
			to: verifiedUser.email,
			subject: "Welcome to DevBench",
			html,
		});
	} catch (emailError) {
		console.error("Welcome email delivery failed:", emailError);
	}

	const { passwordHash, ...userWithoutPassword } = verifiedUser;
	const jwtPayload = {
		id: userWithoutPassword.id,
		name: userWithoutPassword.name,
		email: userWithoutPassword.email,
		role: userWithoutPassword.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in,
	);

	return { user: userWithoutPassword, accessToken, refreshToken };
};

const loginUser = async (payload: ILoginPayload) => {
	const user = await prisma.user.findUnique({
		where: { email: payload.email.toLowerCase() },
		include: {
			company: true,
			candidateProfile: true,
		},
	});

	if (!user) {
		throw createError(404, "User not found with this email");
	}

	if (!user.emailVerified) {
		throw createError(403, "Please verify your email before logging in");
	}

	if (user.status === "SUSPENDED") {
		throw createError(403, "Your account has been suspended");
	}

	if (user.company?.status === "SUSPENDED") {
		throw createError(403, "Your company's account has been suspended");
	}

	if (!user.passwordHash) {
		throw createError(
			400,
			"Password login is not enabled for this account. Try Google login.",
		);
	}

	const isPasswordMatched = await bcrypt.compare(
		payload.password,
		user.passwordHash,
	);

	if (!isPasswordMatched) {
		throw createError(401, "Invalid password credentials");
	}

	const jwtPayload = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in,
	);

	const { passwordHash, ...userWithoutPassword } = user;

	return {
		user: userWithoutPassword,
		accessToken,
		refreshToken,
	};
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;

	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});
		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google ID Token Verification Failed", error);
		throw createError(401, "Invalid or Expired Google ID Token");
	}

	if (!googleIdTokenPayload) {
		throw createError(401, "Invalid or Expired Google ID Token");
	}
	if (!googleIdTokenPayload.email) {
		throw createError(401, "Google Email Not Found");
	}
	if (!googleIdTokenPayload.name) {
		throw createError(401, "Google Account User Name Not Found");
	}

	const googleEmail = googleIdTokenPayload.email;
	const googleSubId = googleIdTokenPayload.sub;

	const existingUser = await prisma.user.findUnique({
		where: { email: googleEmail },
		include: { company: true },
	});

	let user: UserWithCompany;
	let isNewUser = false;

	if (existingUser) {
		if (existingUser.googleId === googleSubId) {
			user = existingUser;
		} else {
			if (existingUser.status === "SUSPENDED") {
				throw createError(403, "User is Suspended");
			}
			if (existingUser.status === "DELETED") {
				throw createError(403, "User is deleted");
			}

			user = await prisma.user.update({
				where: { id: existingUser.id },
				data: {
					googleId: googleSubId,
					// Google has already verified this email address — an existing
					// credentials-registered-but-unverified account is now verified.
					...(!existingUser.emailVerified && { emailVerified: true }),
				},
				include: { company: true },
			});
		}
	} else {
		if (payload.role === "COMPANY_OWNER" && !payload.companyName) {
			throw createError(
				400,
				"companyName is required when registering as a Company Owner",
			);
		}

		isNewUser = true;

		user = await prisma.$transaction(async (tx) => {
			if (payload.role === "COMPANY_OWNER") {
				const company = await tx.company.create({
					data: {
						companyName: payload.companyName!,
						creditBalance: 10,
					},
				});

				return tx.user.create({
					data: {
						name: googleIdTokenPayload!.name!,
						email: googleEmail,
						role: "COMPANY_OWNER",
						emailVerified: true,
						googleId: googleSubId,
						provider: AuthProvider.GOOGLE,
						companyId: company.id,
					},
					include: { company: true },
				});
			}

			const newUser = await tx.user.create({
				data: {
					name: googleIdTokenPayload!.name!,
					email: googleEmail,
					role: "CANDIDATE",
					emailVerified: true,
					googleId: googleSubId,
					provider: "GOOGLE",
				},
				include: { company: true },
			});

			await tx.candidateProfile.create({
				data: { userId: newUser.id, skills: [] },
			});

			return newUser;
		});

		const templateFileName =
			user.role === "CANDIDATE" ? "candidate-welcome" : "owner-welcome";
		const templatePath = path.join(
			process.cwd(),
			`src/templates/${templateFileName}.ejs`,
		);

		const templateData = {
			name: user.name,
			email: user.email,
			companyName: user.company
				? user.company.companyName
				: "Your Company Workspace",
		};

		try {
			const html = await ejs.renderFile(templatePath, templateData);
			await transporter.sendMail({
				from: config.mail_from,
				to: user.email,
				subject: "Welcome to DevBench",
				html,
			});
		} catch (emailError) {
			console.error("Welcome email delivery failed:", emailError);
		}
	}

	if (user.status === "SUSPENDED") {
		throw createError(403, "User is Suspended");
	}
	if (user.status === "DELETED") {
		throw createError(403, "User is deleted");
	}

	const jwtPayload = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in,
	);

	return { accessToken, refreshToken, isNewUser };
};

const refreshToken = async (token: string) => {
	const verified = jwtUtils.verifyToken(token, config.jwt_refresh_secret);

	if (!verified.success) {
		throw createError(401, "Invalid or expired refresh token");
	}

	const { id } = verified.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id },
	});

	if (!user) {
		throw createError(404, "User no longer exists");
	}

	if (user.status === "SUSPENDED") {
		throw createError(403, "Your account has been suspended");
	}

	const jwtPayload = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in,
	);

	return {
		accessToken,
	};
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const { email } = payload;
	const user = await prisma.user.findUnique({ where: { email } });

	if (!user) {
		throw createError(404, "User does not exist");
	}
	if (!user.emailVerified) {
		throw createError(403, "Please verify your email first");
	}
	if (user.status === "SUSPENDED") {
		throw createError(403, "This account has been suspended");
	}
	if (user.status === "DELETED") {
		throw createError(403, "This account has been deleted");
	}
	if (!user.passwordHash) {
		throw createError(
			400,
			"Password login is not enabled for this account. Try Google login.",
		);
	}

	const otp = crypto.randomInt(100000, 1000000).toString();
	const key = `forgot-password-otp:${user.email}`;

	await redis.set(key, otp, {
		ex: Number(config.forgot_password_otp_ttl_seconds),
	});

	const templatePath = path.join(
		process.cwd(),
		"src/templates/forgot-password.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		name: user.name,
		expiryMinutes: Number(config.forgot_password_otp_ttl_seconds) / 60,
		otp,
	});

	await transporter.sendMail({
		from: config.mail_from,
		to: user.email,
		subject: "Reset your DevBench password",
		html,
	});

	return {
		email: user.email,
		otpExpiresInSeconds: Number(config.forgot_password_otp_ttl_seconds),
	};
};

const resetPassword = async (payload: IResetPasswordPayload) => {
	const { email, otp, newPassword } = payload;
	const user = await prisma.user.findUnique({ where: { email } });

	if (!user) {
		throw createError(404, "User does not exist");
	}
	if (!user.emailVerified) {
		throw createError(403, "Please verify your email first");
	}
	if (user.status === "SUSPENDED") {
		throw createError(403, "This account has been suspended");
	}
	if (user.status === "DELETED") {
		throw createError(403, "This account has been deleted");
	}
	if (!user.passwordHash) {
		throw createError(
			400,
			"Password login is not enabled for this account. Try Google login.",
		);
	}

	const key = `forgot-password-otp:${user.email}`;
	const storedOtpRaw = await redis.get(key);
	const storedOtp = storedOtpRaw !== null ? String(storedOtpRaw) : null;

	if (!storedOtp) {
		throw createError(400, "Invalid or expired OTP");
	}
	if (storedOtp !== otp) {
		throw createError(400, "OTP does not match");
	}

	const passwordHash = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds) || 12,
	);

	const updatedUser = await prisma.user.update({
		where: { email: user.email },
		data: { passwordHash },
	});

	await writeAuditLog({
		actorId: user.id,
		actorRole: user.role,
		action: "PASSWORD_RESET",
		entityType: "User",
		entityId: user.id,
	});

	await redis.del(key);

	const templatePath = path.join(
		process.cwd(),
		"src/templates/reset-password-success.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		name: user.name,
		changedAt: updatedUser.updatedAt,
	});

	try {
		await transporter.sendMail({
			from: config.mail_from,
			to: user.email,
			subject: "Your password was changed",
			html,
		});
	} catch (emailError) {
		console.error("Password-change confirmation email failed:", emailError);
	}

	return null;
};

export const authService = {
	registerUser,
	verifyEmail,
	loginUser,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
};
