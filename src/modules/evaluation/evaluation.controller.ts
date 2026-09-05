import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";

const getPendingSubmissions = catchAsync(
	async (req: Request, res: Response) => {},
);

const getSubmissionDetail = catchAsync(
	async (req: Request, res: Response) => {},
);

const gradeSubmission = catchAsync(async (req: Request, res: Response) => {});

export const evaluationController = {
	getPendingSubmissions,
	getSubmissionDetail,
	gradeSubmission,
};
