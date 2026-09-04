import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import type { UserRole } from "../../generated/prisma";
import config from "../config";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { createError } from "../utils/createError";
import { jwtUtils } from "../utils/jwt";

export interface RequestUser {
	userId: string;
	name: string;
	email: string;
	role: UserRole;
	companyId?: string | null;
}

declare global {
	namespace Express {
		interface Request {
			user?: RequestUser;
		}
	}
}

export const auth = (...requiredRoles: UserRole[]) => {
	return catchAsync(
		async (req: Request, _res: Response, next: NextFunction) => {
			const token = req.cookies.accessToken
				? req.cookies.accessToken
				: req.headers.authorization?.startsWith("Bearer ")
					? req.headers.authorization?.split(" ")[1]
					: req.headers.authorization;
			if (!token) {
				throw createError(401, "No token provided");
			}
			const verifiedToken = jwtUtils.verifyToken(
				token,
				config.jwt_access_secret,
			);

			if (!verifiedToken.success) {
				throw createError(401, verifiedToken.error || "Invalid token");
			}
			const { id } = verifiedToken.data as JwtPayload;
			const user = await prisma.user.findUnique({
				where: {
					id,
				},
			});
			if (!user) {
				throw createError(404, "User not found");
			}
			if (user.status === "SUSPENDED") {
				throw createError(403, "Your account is suspended");
			}
			if (requiredRoles.length && !requiredRoles.includes(user.role)) {
				throw createError(
					403,
					"You do not have permission to access this resource",
				);
			}

			req.user = {
				userId: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				companyId: user.companyId,
			};

			next();
		},
	);
};

export const optionalAuth = () => {
	return catchAsync(
		async (req: Request, _res: Response, next: NextFunction) => {
			const token = req.cookies.accessToken
				? req.cookies.accessToken
				: req.headers.authorization?.startsWith("Bearer ")
					? req.headers.authorization?.split(" ")[1]
					: req.headers.authorization;

			// No token at all — proceed unauthenticated, req.user stays undefined
			if (!token) {
				return next();
			}

			const verifiedToken = jwtUtils.verifyToken(
				token,
				config.jwt_access_secret,
			);

			// Invalid/expired token — don't fail the request, just treat as unauthenticated
			if (!verifiedToken.success) {
				return next();
			}

			const { id } = verifiedToken.data as JwtPayload;
			const user = await prisma.user.findUnique({ where: { id } });

			if (!user || user.status === "SUSPENDED") {
				return next();
			}

			req.user = {
				userId: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				companyId: user.companyId,
			};

			next();
		},
	);
};
