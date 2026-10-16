import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ICallerInfo } from "./insights.interface";
import { insightsService } from "./insights.service";
import { insightsValidation } from "./insights.validation";

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

const getProblemSuggestions = catchAsync(
	async (req: Request, res: Response) => {
		const query = await insightsValidation.suggestionsQuerySchema.parseAsync(
			req.query,
		);
		const result = await insightsService.getProblemSuggestions(
			req.params.id as string,
			callerOf(req),
			{
				minutes: query.minutes,
				mix: { CODING: query.coding, MCQ: query.mcq, WRITTEN: query.written },
				difficulty: query.difficulty,
			},
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Problem suggestions ready",
			data: result,
		});
	},
);

export const insightsController = {
	getProblemSuggestions,
	getAttemptSignals,
	getSubmissionSimilarity,
	getAssessmentInsights,
	getAttemptInsights,
};
