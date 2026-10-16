import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ICallerInfo } from "./insights.interface";
import { insightsService } from "./insights.service";

const getAttemptSignals = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await insightsService.getAttemptSignals(
		req.params.id as string,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Attempt signals fetched successfully",
		data: result,
	});
});

const callerOf = (req: Request): ICallerInfo => ({
	userId: req.user!.userId,
	role: req.user!.role,
	companyId: req.user!.companyId,
});

const getSubmissionSimilarity = catchAsync(
	async (req: Request, res: Response) => {
		const result = await insightsService.getSubmissionSimilarity(
			req.params.id as string,
			callerOf(req),
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Similarity check completed",
			data: result,
		});
	},
);

const getAssessmentInsights = catchAsync(
	async (req: Request, res: Response) => {
		const result = await insightsService.getAssessmentInsights(
			req.params.id as string,
			callerOf(req),
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment insights fetched successfully",
			data: result,
		});
	},
);

const getAttemptInsights = catchAsync(async (req: Request, res: Response) => {
	const result = await insightsService.getAttemptInsights(
		req.params.id as string,
		callerOf(req),
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Attempt insights fetched successfully",
		data: result,
	});
});

export const insightsController = {
	getAttemptSignals,
	getSubmissionSimilarity,
	getAssessmentInsights,
	getAttemptInsights,
};
