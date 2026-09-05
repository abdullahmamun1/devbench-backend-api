import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type {
	ICallerInfo,
	IEvaluationFilterQuery,
} from "./evaluation.interface";
import { evaluationService } from "./evaluation.service";

const getPendingSubmissions = catchAsync(
	async (req: Request, res: Response) => {
		const caller: ICallerInfo = {
			userId: req.user!.userId,
			role: req.user!.role,
			companyId: req.user!.companyId,
		};
		const query = req.query as IEvaluationFilterQuery;
		const { data, meta } = await evaluationService.getPendingSubmissions(
			query,
			caller,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Pending submissions fetched successfully",
			meta,
			data,
		});
	},
);

const getSubmissionDetail = catchAsync(async (req: Request, res: Response) => {
	const submissionResultId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await evaluationService.getSubmissionDetail(
		submissionResultId,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Submission retrieved successfully",
		data: result,
	});
});

const gradeSubmission = catchAsync(async (req: Request, res: Response) => {
	const submissionResultId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await evaluationService.gradeSubmission(
		submissionResultId,
		req.body,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Submission graded successfully",
		data: result,
	});
});

export const evaluationController = {
	getPendingSubmissions,
	getSubmissionDetail,
	gradeSubmission,
};
