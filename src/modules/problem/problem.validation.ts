import { z } from "zod";

const testCaseValidationSchema = z.object({
	input: z.string().min(1, "Input is required"),
	expectedOutput: z.string().min(1, "Expected output is required"),
	isHidden: z.boolean().default(false),
	weight: z.number().int().positive().default(1),
});

const mcqOptionValidationSchema = z.object({
	text: z.string().min(1, "Option text is required"),
	isCorrect: z.boolean().default(false),
	order: z.number().int().nonnegative(),
});

const createProblemValidationSchema = z
	.object({
		title: z.string().min(3, "Title must be at least 3 characters").max(255),
		description: z
			.string()
			.min(10, "Description must be at least 10 characters"),
		type: z.enum(["CODING", "MCQ", "WRITTEN"]),
		points: z.number().int().positive("Points must be a positive integer"),
		companyId: z.uuid("Invalid company ID").optional(),
		testCases: z.array(testCaseValidationSchema).optional(),
		mcqOptions: z.array(mcqOptionValidationSchema).optional(),
	})
	.refine(
		(data) => {
			if (
				data.type === "CODING" &&
				(!data.testCases || data.testCases.length === 0)
			) {
				return false;
			}
			return true;
		},
		{
			message: "Coding problems must include at least one test case",
			path: ["testCases"],
		},
	)
	.refine(
		(data) => {
			if (data.type === "MCQ") {
				if (!data.mcqOptions || data.mcqOptions.length < 2) {
					return false;
				}
				const hasCorrect = data.mcqOptions.some((opt) => opt.isCorrect);
				if (!hasCorrect) {
					return false;
				}
			}
			return true;
		},
		{
			message:
				"MCQ problems must have at least 2 options and at least one correct option",
			path: ["mcqOptions"],
		},
	);

const updateProblemValidationSchema = z.object({
	title: z.string().min(3).max(255).optional(),
	description: z.string().min(10).optional(),
	points: z.number().int().positive().optional(),
	testCases: z.array(testCaseValidationSchema).optional(),
	mcqOptions: z.array(mcqOptionValidationSchema).optional(),
});

export const problemValidation = {
	createProblemValidationSchema,
	updateProblemValidationSchema,
};
