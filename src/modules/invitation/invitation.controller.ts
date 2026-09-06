import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type {
	ICallerInfo,
	IInvitationFilterQuery,
} from "./invitation.interface";
import { invitationService } from "./invitation.service";

const createInvitation = catchAsync(async (req: Request, res: Response) => {
	const assessmentId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};

	const result = await invitationService.createInvitation(
		assessmentId,
		req.body,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Invitation sent successfully",
		data: result,
	});
});

const getAllInvitations = catchAsync(async (req: Request, res: Response) => {
	const assessmentId = req.params.id as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const query = req.query as IInvitationFilterQuery;

	const { data, meta } = await invitationService.getAllInvitations(
		assessmentId,
		query,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Invitations fetched successfully",
		meta,
		data,
	});
});

const getMyInvitations = catchAsync(async (req: Request, res: Response) => {
	const result = await invitationService.getMyInvitations(
		req.user!.userId,
		req.user!.email,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Your invitations fetched successfully",
		data: result,
	});
});

const getInvitationPreview = catchAsync(async (req: Request, res: Response) => {
	const token = req.params.token as string;

	const result = await invitationService.getInvitationPreview(token);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Invitation retrieved successfully",
		data: result,
	});
});

const acceptInvitation = catchAsync(async (req: Request, res: Response) => {
	const token = req.params.token as string;

	const result = await invitationService.acceptInvitation(
		token,
		req.user?.userId,
		req.body,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Invitation accepted successfully",
		data: result,
	});
});

const resendInvitation = catchAsync(async (req: Request, res: Response) => {
	const assessmentId = req.params.id as string;
	const invitationId = req.params.invitationId as string;
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const result = await invitationService.resendInvitation(
		assessmentId,
		invitationId,
		caller,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Invitation resent successfully",
		data: result,
	});
});

export const invitationController = {
	createInvitation,
	getAllInvitations,
	getMyInvitations,
	getInvitationPreview,
	acceptInvitation,
	resendInvitation,
};
