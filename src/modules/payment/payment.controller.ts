import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ICallerInfo } from "./payment.interface";
import { paymentService } from "./payment.service";

const createCheckoutSession = catchAsync(
	async (req: Request, res: Response) => {
		const caller: ICallerInfo = {
			userId: req.user!.userId,
			role: req.user!.role,
			companyId: req.user!.companyId,
		};
		const result = await paymentService.createCheckoutSession(req.body, caller);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Checkout session created successfully",
			data: result,
		});
	},
);

const handleWebhook = catchAsync(async (req: Request, res: Response) => {});

const getPaymentHistory = catchAsync(async (req: Request, res: Response) => {});

export const paymentController = {
	createCheckoutSession,
	handleWebhook,
	getPaymentHistory,
};
