import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { contactService } from "./contact.service";

const sendContactMessage = catchAsync(async (req: Request, res: Response) => {
	const result = await contactService.sendContactMessage(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Your message has been sent",
		data: result,
	});
});

export const contactController = {
	sendContactMessage,
};
