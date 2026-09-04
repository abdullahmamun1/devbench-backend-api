import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";

const createAssessment = catchAsync(async (req: Request, res: Response) => {});

const getAllAssessments = catchAsync(async (req: Request, res: Response) => {});

const getAssessmentById = catchAsync(async (req: Request, res: Response) => {});

const updateAssessment = catchAsync(async (req: Request, res: Response) => {});

const deleteAssessment = catchAsync(async (req: Request, res: Response) => {});

const attachProblem = catchAsync(async (req: Request, res: Response) => {});

const detachProblem = catchAsync(async (req: Request, res: Response) => {});

const publishAssessment = catchAsync(async (req: Request, res: Response) => {});

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
