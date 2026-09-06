import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type {
	IAuditLogFilterQuery,
	ICallerInfo,
	IListQuery,
} from "./admin.interface";
import { adminService } from "./admin.service";

const listCompanies = catchAsync(async (req: Request, res: Response) => {
	const query = req.query as IListQuery;
	const { data, meta } = await adminService.listCompanies(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Companies fetched successfully",
		meta,
		data,
	});
});

const listCandidates = catchAsync(async (req: Request, res: Response) => {
	const query = req.query as IListQuery;
	const { data, meta } = await adminService.listCandidates(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Candidates fetched successfully",
		meta,
		data,
	});
});

const suspendCompany = catchAsync(async (req: Request, res: Response) => {
	const companyId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
	};
	const result = await adminService.suspendCompany(companyId, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Company suspended successfully",
		data: result,
	});
});

const suspendCandidate = catchAsync(async (req: Request, res: Response) => {
	const candidateId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
	};
	const result = await adminService.suspendCandidate(candidateId, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Candidate suspended successfully",
		data: result,
	});
});

const getAuditLogs = catchAsync(async (req: Request, res: Response) => {
	const query = req.query as IAuditLogFilterQuery;
	const { data, meta } = await adminService.getAuditLogs(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Audit logs fetched successfully",
		meta,
		data,
	});
});

const getPlatformStats = catchAsync(async (req: Request, res: Response) => {
	const result = await adminService.getPlatformStats();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Platform stats fetched successfully",
		data: result,
	});
});

const adjustCredits = catchAsync(async (req: Request, res: Response) => {});

export const adminController = {
	listCompanies,
	listCandidates,
	suspendCompany,
	suspendCandidate,
	getAuditLogs,
	getPlatformStats,
	adjustCredits,
};
