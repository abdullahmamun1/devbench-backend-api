import type { Request, Response } from "express";
import httpStatus from "http-status";
import {
	clearAuthCookies,
	readRefreshToken,
	setAuthCookies,
	tokensForBody,
} from "../../utils/authCookies";
import { catchAsync } from "../../utils/catchAsync";
import { createError } from "../../utils/createError";
import { sendResponse } from "../../utils/sendResponse";
import { authService } from "./auth.service";

const register = catchAsync(async (req: Request, res: Response) => {
	const result = await authService.registerUser(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "OTP sent to your email — verify to complete registration",
		data: result,
	});
});
const resendOtp = catchAsync(async (req: Request, res: Response) => {
	const result = await authService.resendRegistrationOtp(req.body.email);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message:
			"If this email has an unverified account, a new code is on its way",
		data: result,
	});
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
	const result = await authService.verifyEmail(req.body);

	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "User registered successfully",
		data: { user: result.user, ...tokensForBody(result) },
	});
});

const login = catchAsync(async (req: Request, res: Response) => {
	const result = await authService.loginUser(req.body);

	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: { user: result.user, ...tokensForBody(result) },
	});
});

const googleLogin = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const result = await authService.googleLogin(payload);

	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: { isNewUser: result.isNewUser, ...tokensForBody(result) },
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	const incomingToken = readRefreshToken(req.cookies, req.body);

	if (!incomingToken) {
		throw createError(401, "No refresh token provided");
	}

	const result = await authService.refreshToken(incomingToken);

	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Token refreshed successfully",
		data: tokensForBody(result),
	});
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
	const result = await authService.forgotPassword(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "OTP sent to your email to reset your password",
		data: result,
	});
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
	await authService.resetPassword(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message:
			"Password reset successfully. Please log in with your new password",
		data: null,
	});
});

const logout = catchAsync(async (req: Request, res: Response) => {
	await authService.logoutUser(req.user!.userId);

	clearAuthCookies(res);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Logged out successfully",
		data: null,
	});
});

export const authController = {
	register,
	resendOtp,
	login,
	verifyEmail,
	googleLogin,
	refreshToken,
	forgotPassword,
	resetPassword,
	logout,
};
