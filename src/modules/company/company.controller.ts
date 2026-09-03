import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { companyService } from "./company.service";

const createCompany = catchAsync(async (req: Request, res: Response) => {
	const caller = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await companyService.createCompany(req.body, caller);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Company created successfully",
		data: result,
	});
});

const getMyCompany = catchAsync(async (req: Request, res: Response) => {
	const caller = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await companyService.getMyCompany(caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Company retrieved successfully",
		data: result,
	});
});

const updateCompany = catchAsync(async (req: Request, res: Response) => {
	const caller = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await companyService.updateCompany(req.body, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Company updated successfully",
		data: result,
	});
});

const getCredits = catchAsync(async (req: Request, res: Response) => {
	const caller = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await companyService.getCredits(caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Credit balance retrieved successfully",
		data: result,
	});
});

const inviteTeamMember = catchAsync(async (req: Request, res: Response) => {
	const caller = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await companyService.inviteTeamMember(req.body, caller);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Team invitation sent successfully",
		data: result,
	});
});

const acceptTeamInvitation = catchAsync(async (req: Request, res: Response) => {
	const token = req.params.token as string;
	const result = await companyService.acceptTeamInvitation(
		token,
		req.user?.userId,
		req.body,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Team invitation accepted successfully",
		data: result,
	});
});

export const companyController = {
	createCompany,
	getMyCompany,
	updateCompany,
	getCredits,
	inviteTeamMember,
	acceptTeamInvitation,
};
