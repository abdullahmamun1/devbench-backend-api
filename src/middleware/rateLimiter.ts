import { Ratelimit } from "@upstash/ratelimit";
import type { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis";
import { catchAsync } from "../utils/catchAsync";
import { createError } from "../utils/createError";

// Sliding window limiter for standard API routes (100 requests per 1 minute per IP)
const standardLimiter = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(100, "1 m"),
	analytics: true,
	prefix: "@ratelimit/api",
});

// Stricter limiter for authentication/sensitive routes (10 requests per 1 minute per IP)
const authLimiter = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(10, "1 m"),
	analytics: true,
	prefix: "@ratelimit/auth",
});

const getClientIp = (req: Request): string => {
	const forwarded = req.headers["x-forwarded-for"];
	if (typeof forwarded === "string") {
		return forwarded.split(",")[0].trim();
	}
	return req.ip || req.socket.remoteAddress || "127.0.0.1";
};

export const rateLimiter = (type: "standard" | "auth" = "standard") => {
	const limiter = type === "auth" ? authLimiter : standardLimiter;

	return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
		// Skip rate limiting if redis is not configured (e.g. In test/mock environment)
		if (!redis) {
			return next();
		}

		const identifier = `${getClientIp(req)}_${req.user?.userId || "anon"}`;

		try {
			const { success, limit, remaining, reset } =
				await limiter.limit(identifier);

			res.setHeader("X-RateLimit-Limit", limit);
			res.setHeader("X-RateLimit-Remaining", remaining);
			res.setHeader("X-RateLimit-Reset", reset);

			if (!success) {
				throw createError(
					429,
					"Too many requests. Please slow down and try again later.",
				);
			}

			next();
		} catch (error) {
			// If error is a 429 createError, rethrow it
			if (
				typeof error === "object" &&
				error !== null &&
				"statusCode" in error &&
				(error as { statusCode: number }).statusCode === 429
			) {
				throw error;
			}
			// If redis is unreachable/down, fail-open to not block users
			console.warn("Rate limiter warning (redis bypassed):", error);
			next();
		}
	});
};
