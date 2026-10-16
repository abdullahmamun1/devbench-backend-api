import type { CookieOptions, Response } from "express";
import config from "../config";

const ACCESS_TOKEN_MAX_AGE = 1000 * 60 * 60 * 24; // 1 day
const REFRESH_TOKEN_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days

const isProduction = () => config.node_env === "production";

// The frontend reaches the API through its own /api/v1 rewrite, so these
// cookies are first party and "lax" is enough. It also blocks the cross-site
// POSTs that "none" would allow.
const baseOptions = (): CookieOptions => ({
	httpOnly: true,
	secure: isProduction(),
	sameSite: "lax",
	path: "/",
});

export const setAuthCookies = (
	res: Response,
	tokens: { accessToken: string; refreshToken: string },
) => {
	res.cookie("accessToken", tokens.accessToken, {
		...baseOptions(),
		maxAge: ACCESS_TOKEN_MAX_AGE,
	});
	res.cookie("refreshToken", tokens.refreshToken, {
		...baseOptions(),
		maxAge: REFRESH_TOKEN_MAX_AGE,
	});
};

// clearCookie only removes a cookie when the attributes match the ones it was set with.
export const clearAuthCookies = (res: Response) => {
	res.clearCookie("accessToken", baseOptions());
	res.clearCookie("refreshToken", baseOptions());
};

// Tokens live in httpOnly cookies. Echoing them in the JSON body would let any
// injected script read them, so production never does. Development keeps them
// for the Postman collection, which sends one Bearer token per role.
export const tokensForBody = (tokens: {
	accessToken: string;
	refreshToken: string;
}) =>
	isProduction()
		? {}
		: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };

// Production only trusts the cookie. Development also accepts the body field
// so the refresh request in Postman keeps working.
export const readRefreshToken = (
	cookies: Record<string, string | undefined>,
	body: { refreshToken?: unknown } | undefined,
): string | undefined => {
	if (cookies.refreshToken) return cookies.refreshToken;
	if (isProduction()) return undefined;
	return typeof body?.refreshToken === "string" ? body.refreshToken : undefined;
};
