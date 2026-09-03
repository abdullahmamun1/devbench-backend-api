import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { createError } from "../../utils/createError";
import { sendResponse } from "../../utils/sendResponse";
import { userService } from "./user.service";

const getMe = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user?.userId;
	if (!userId) {
		throw createError(httpStatus.UNAUTHORIZED, "Unauthorized");
	}

	const result = await userService.getMyProfile(userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: result,
	});
});

const updateMe = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user?.userId;
	if (!userId) {
		throw createError(httpStatus.UNAUTHORIZED, "Unauthorized");
	}

	const result = await userService.updateMyProfile(userId, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile updated successfully",
		data: result,
	});
});

export const userController = {
	getMe,
	updateMe,
};
