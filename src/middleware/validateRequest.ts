import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { catchAsync } from "../utils/catchAsync";

export const validateRequest = (schema: ZodType) =>
	catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
		req.body = await schema.parseAsync(req.body ?? {});
		next();
	});
