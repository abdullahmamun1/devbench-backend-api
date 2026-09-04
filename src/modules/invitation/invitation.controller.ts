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

export const invitationController = {
	createInvitation,
	getAllInvitations,
	getInvitationPreview,
	acceptInvitation,
};
