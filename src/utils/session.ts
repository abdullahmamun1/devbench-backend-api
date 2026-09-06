import crypto from "node:crypto";
import config from "../config";
import { redis } from "../lib/redis";

const hashToken = (token: string) =>
	crypto.createHash("sha256").update(token).digest("hex");

export const storeRefreshToken = async (
	userId: string,
	refreshToken: string,
) => {
	// One valid refresh token per user — issuing a new one immediately
	// invalidates whatever was previously stored for this user.
	await redis.set(`refresh-token:${userId}`, hashToken(refreshToken), {
		ex: Number(config.refresh_token_ttl_seconds),
	});
};

export const verifyStoredRefreshToken = async (
	userId: string,
	incomingToken: string,
) => {
	const storedHash = await redis.get<string>(`refresh-token:${userId}`);
	return storedHash === hashToken(incomingToken);
};

export const revokeRefreshToken = async (userId: string) => {
	await redis.del(`refresh-token:${userId}`);
};
