import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { publicService } from "./public.service";

const getPublicStats = catchAsync(async (_req: Request, res: Response) => {
	const result = await publicService.getPublicStats();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Platform stats fetched successfully",
		data: result,
	});
});

export const publicController = {
	getPublicStats,
};
