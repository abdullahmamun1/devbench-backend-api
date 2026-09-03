import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { catchAsync } from "../utils/catchAsync";

declare global {
	namespace Express {
		interface Request {
			validatedQuery?: unknown;
		}
	}
}

export const validateRequest = (schema: ZodType) =>
	catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		req.body = await schema.parseAsync(req.body ?? {});
		next();
	});

export const validateParams = (schema: ZodType) =>
	catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		await schema.parseAsync(req.params ?? {});
		next();
	});

export const validateQuery = (schema: ZodType) =>
	catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		req.validatedQuery = await schema.parseAsync(req.query ?? {});
		next();
	});
