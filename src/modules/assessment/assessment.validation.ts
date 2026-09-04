import { z } from "zod";

const createAssessmentValidationSchema = z.object({
	title: z.string().min(3, "Title must be at least 3 characters").max(255),
	description: z
		.string()
		.min(10, "Description must be at least 10 characters")
		.optional(),
	durationMinutes: z
		.number()
		.int()
		.positive("Duration must be a positive integer"),
	passingScore: z
		.number()
		.int()
		.nonnegative("Passing score cannot be negative"),
});

const updateAssessmentValidationSchema = z.object({
	title: z
		.string()
		.min(3, "Title must be at least 3 characters")
		.max(255)
		.optional(),
	description: z
		.string()
		.min(10, "Description must be at least 10 characters")
		.optional(),
	durationMinutes: z
		.number()
		.int()
		.positive("Duration must be a positive integer")
		.optional(),
	passingScore: z
		.number()
		.int()
		.nonnegative("Passing score cannot be negative")
		.optional(),
});

const attachProblemValidationSchema = z.object({
	problemId: z.uuid("Invalid problem ID"),
	order: z.number().int().nonnegative(),
	points: z.number().int().positive("Points must be a positive integer"),
});

export const assessmentValidation = {
	createAssessmentValidationSchema,
	updateAssessmentValidationSchema,
	attachProblemValidationSchema,
};
