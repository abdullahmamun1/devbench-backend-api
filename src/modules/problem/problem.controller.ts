import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ICallerInfo, IProblemFilterQuery } from "./problem.interface";
import { problemService } from "./problem.service";

const createProblem = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await problemService.createProblem(req.body, caller);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Problem created successfully",
		data: result,
	});
});

const getAllProblems = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const query = (req.validatedQuery || req.query) as IProblemFilterQuery;
	const { data, meta } = await problemService.getAllProblems(query, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problems fetched successfully",
		meta,
		data,
	});
});

const getProblemById = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const id = req.params.id as string;
	const result = await problemService.getProblemById(id, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problem retrieved successfully",
		data: result,
	});
});

const updateProblem = catchAsync(async (req: Request, res: Response) => {
	const id = req.params.id as string;
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await problemService.updateProblem(id, req.body, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problem updated successfully",
		data: result,
	});
});

const deleteProblem = catchAsync(async (req: Request, res: Response) => {
	const id = req.params.id as string;
	const caller: ICallerInfo = {
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	await problemService.deleteProblem(id, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problem deleted successfully",
		data: null,
	});
});

export const problemController = {
	createProblem,
	getAllProblems,
	getProblemById,
	updateProblem,
	deleteProblem,
};
