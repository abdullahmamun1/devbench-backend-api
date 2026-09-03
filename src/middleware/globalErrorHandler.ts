/** biome-ignore-all lint/suspicious/noImplicitAnyLet: not added any type */
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import config from "../config";

export const globalErrorHandler = (
	err: any,
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	let statusCode;
	let errorMessage = err.message || "Internal Server Error";
	let errorName = err.name || "Internal Server Error";
	let errorDetails: { field: string; message: string }[] | undefined;

	if (err instanceof ZodError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorName = "ValidationError";
		errorMessage = err.issues[0]?.message || "Invalid request data";
		errorDetails = err.issues.map((issue) => ({
			field: issue.path.join(".") || "body",
			message: issue.message,
		}));
	} else if (typeof err.statusCode === "number") {
		statusCode = err.statusCode;
		errorMessage = err.message;
	} else if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "You have provided incorrect field type or missing fields";
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Duplicate Key Error";
		} else if (err.code === "P2003") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Foreign Key Constraint Failed";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.NOT_FOUND;
			errorMessage = "The requested record was not found";
		}
	} else if (err instanceof Prisma.PrismaClientInitializationError) {
		if (err.errorCode === "P1000") {
			statusCode = httpStatus.UNAUTHORIZED;
			errorMessage =
				"Authentication Failed against Database Server. Please check your credentials";
		} else if (err.errorCode === "P1001") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Can't reach database server";
		}
	} else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
		statusCode = httpStatus.INTERNAL_SERVER_ERROR;
		errorMessage = "Error occured during query execution";
	}

	res.status(statusCode || httpStatus.INTERNAL_SERVER_ERROR).json({
		success: false,
		statusCode: statusCode || httpStatus.INTERNAL_SERVER_ERROR,
		name: errorName,
		message: errorMessage,
		errorDetails,
		...(config.node_env !== "production" && { error: err.stack }),
	});
};
