import bcrypt from "bcryptjs";
import type { JwtPayload } from "jsonwebtoken";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { createError } from "../../utils/createError";
import { jwtUtils } from "../../utils/jwt";
import type { ILoginPayload, IRegisterPayload } from "./auth.interface";

const registerUser = async (payload: IRegisterPayload) => {
	const existingUser = await prisma.user.findUnique({
		where: { email: payload.email.toLowerCase() },
	});

	if (existingUser) {
		throw createError(400, "User with this email already exists");
	}

	const saltRounds = Number(config.bcrypt_salt_rounds) || 12;
	const hashedPassword = await bcrypt.hash(payload.password, saltRounds);

	// Transaction: Create user and associated profile/company
	const result = await prisma.$transaction(async (tx) => {
		let companyId: string | undefined;

		if (payload.role === "COMPANY_OWNER") {
			const company = await tx.company.create({
				data: {
					companyName: payload.companyName || `${payload.name}'s Company`,
					creditBalance: 10, // Starter credits
				},
			});
			companyId = company.id;
		}

		const user = await tx.user.create({
			data: {
				name: payload.name,
				email: payload.email.toLowerCase(),
				passwordHash: hashedPassword,
				role: payload.role,
				companyId,
				provider: "email",
				status: "ACTIVE",
			},
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				companyId: true,
				status: true,
				createdAt: true,
			},
		});

		if (payload.role === "CANDIDATE") {
			await tx.candidateProfile.create({
				data: {
					userId: user.id,
					skills: [],
				},
			});
		}

		return user;
	});

	// Generate Access and Refresh Tokens
	const jwtPayload = {
		id: result.id,
		name: result.name,
		email: result.email,
		role: result.role,
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

	return {
		user: result,
		accessToken,
		refreshToken,
	};
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

	if (user.status === "SUSPENDED") {
		throw createError(403, "Your account has been suspended");
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

export const authService = {
	registerUser,
	loginUser,
	refreshToken,
};
