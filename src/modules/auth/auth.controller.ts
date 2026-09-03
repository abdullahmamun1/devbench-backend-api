import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { catchAsync } from "../../utils/catchAsync";
import { createError } from "../../utils/createError";
import { sendResponse } from "../../utils/sendResponse";
import { authService } from "./auth.service";

const register = catchAsync(async (req: Request, res: Response) => {
	const result = await authService.registerUser(req.body);

	const isProduction = config.node_env === "production";

	res.cookie("refreshToken", result.refreshToken, {
		secure: isProduction,
		httpOnly: true,
		sameSite: isProduction ? "none" : "lax",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	res.cookie("accessToken", result.accessToken, {
		secure: isProduction,
		httpOnly: true,
		sameSite: isProduction ? "none" : "lax",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "User registered successfully",
		data: {
			user: result.user,
			accessToken: result.accessToken,
			refreshToken: result.refreshToken,
		},
	});
});

const login = catchAsync(async (req: Request, res: Response) => {
	const result = await authService.loginUser(req.body);

	const isProduction = config.node_env === "production";

	res.cookie("refreshToken", result.refreshToken, {
		secure: isProduction,
		httpOnly: true,
		sameSite: isProduction ? "none" : "lax",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	res.cookie("accessToken", result.accessToken, {
		secure: isProduction,
		httpOnly: true,
		sameSite: isProduction ? "none" : "lax",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: {
			user: result.user,
			accessToken: result.accessToken,
			refreshToken: result.refreshToken,
		},
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	const token = req.cookies.refreshToken || req.body.refreshToken;

	if (!token) {
		throw createError(httpStatus.UNAUTHORIZED, "Refresh Token is Missing.");
	}

	const result = await authService.refreshToken(token);

	const isProduction = config.node_env === "production";

	res.cookie("accessToken", result.accessToken, {
		secure: isProduction,
		httpOnly: true,
		sameSite: isProduction ? "none" : "lax",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "Access token refreshed successfully",
		data: result,
	});
});

const logout = catchAsync(async (req: Request, res: Response) => {
	const isProduction = config.node_env === "production";

	res.clearCookie("accessToken", {
		secure: isProduction,
		httpOnly: true,
		sameSite: isProduction ? "none" : "lax",
	});

	res.clearCookie("refreshToken", {
		secure: isProduction,
		httpOnly: true,
		sameSite: isProduction ? "none" : "lax",
	});

	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "User logged out successfully",
		data: null,
	});
});

export const authController = {
	register,
	login,
	refreshToken,
	logout,
};
