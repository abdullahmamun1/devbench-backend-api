import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type {
	IAssessmentFilterQuery,
	ICallerInfo,
} from "./assessment.interface";
import { assessmentService } from "./assessment.service";

const createAssessment = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};

	const result = await assessmentService.createAssessment(req.body, caller);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Assessment created successfully",
		data: result,
	});
});

const getAllAssessments = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const query = req.query as IAssessmentFilterQuery;

	const { data, meta } = await assessmentService.getAllAssessments(
		query,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessments fetched successfully",
		meta,
		data,
	});
});

const getAssessmentById = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const id = req.params.id as string;

	const result = await assessmentService.getAssessmentById(id, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment retrieved successfully",
		data: result,
	});
});

const updateAssessment = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const id = req.params.id as string;

	const result = await assessmentService.updateAssessment(id, req.body, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment updated successfully",
		data: result,
	});
});

const deleteAssessment = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const id = req.params.id as string;

	await assessmentService.deleteAssessment(id, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment deleted successfully",
		data: null,
	});
});

const attachProblem = catchAsync(async (req: Request, res: Response) => {
	const assessmentId = req.params.id as string;
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};

	const result = await assessmentService.attachProblem(
		assessmentId,
		req.body,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Problem attached to assessment successfully",
		data: result,
	});
});

const detachProblem = catchAsync(async (req: Request, res: Response) => {
	const assessmentId = req.params.id as string;
	const problemId = req.params.problemId as string;
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};

	await assessmentService.detachProblem(assessmentId, problemId, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problem detached from assessment successfully",
		data: null,
	});
});

const publishAssessment = catchAsync(async (req: Request, res: Response) => {
	const id = req.params.id as string;
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};

	const result = await assessmentService.publishAssessment(id, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment published successfully",
		data: result,
	});
});

export const assessmentController = {
	createAssessment,
	getAllAssessments,
	getAssessmentById,
	updateAssessment,
	deleteAssessment,
	attachProblem,
	detachProblem,
	publishAssessment,
};
