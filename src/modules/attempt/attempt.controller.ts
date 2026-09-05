import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ICallerInfo } from "./attempt.interface";
import { attemptService } from "./attempt.service";

const startAttempt = catchAsync(async (req: Request, res: Response) => {
	const assessmentId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await attemptService.startAttempt(assessmentId, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Attempt started successfully",
		data: result,
	});
});

const getAttemptById = catchAsync(async (req: Request, res: Response) => {
	const attemptId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await attemptService.getAttemptById(attemptId, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Attempt retrieved successfully",
		data: result,
	});
});

const upsertSubmission = catchAsync(async (req: Request, res: Response) => {
	const attemptId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await attemptService.upsertSubmission(
		attemptId,
		req.body,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Answer saved successfully",
		data: result,
	});
});

const finalSubmit = catchAsync(async (req: Request, res: Response) => {
	const attemptId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await attemptService.finalSubmit(attemptId, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Attempt submitted successfully",
		data: result,
	});
});

export const attemptController = {
	startAttempt,
	getAttemptById,
	upsertSubmission,
	finalSubmit,
};
