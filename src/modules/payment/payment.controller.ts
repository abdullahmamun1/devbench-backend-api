import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { createError } from "../../utils/createError";
import { sendResponse } from "../../utils/sendResponse";
import type { ICallerInfo, IPaymentFilterQuery } from "./payment.interface";
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

const handleWebhook = catchAsync(async (req: Request, res: Response) => {
	const signature = req.headers["stripe-signature"];

	if (!signature || typeof signature !== "string") {
		throw createError(400, "Missing Stripe signature header");
	}

	const result = await paymentService.handleWebhook(
		req.body as Buffer,
		signature,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Webhook processed",
		data: result,
	});
});

const getPaymentHistory = catchAsync(async (req: Request, res: Response) => {
	const caller: ICallerInfo = {
		userId: req.user!.userId,
		role: req.user!.role,
		companyId: req.user!.companyId,
	};
	const query = req.query as IPaymentFilterQuery;
	const { data, meta } = await paymentService.getPaymentHistory(query, caller);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment history fetched successfully",
		meta,
		data,
	});
});

export const paymentController = {
	createCheckoutSession,
	handleWebhook,
	getPaymentHistory,
};
