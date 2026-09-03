import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../lib/prisma";
import { createError } from "../../utils/createError";
import type {
	ICallerInfo,
	ICreateProblemPayload,
	IProblemFilterQuery,
	IUpdateProblemPayload,
} from "./problem.interface";

const createProblem = async (
	payload: ICreateProblemPayload,
	caller: ICallerInfo,
) => {
	// Admin can set companyId explicitly via body or leave null (global problem)
	// Other roles get their own companyId attached automatically
	const finalCompanyId =
		caller.role === "ADMIN"
			? (payload.companyId ?? null)
			: (caller.companyId ?? null);

	return await prisma.$transaction(async (tx) => {
		const problem = await tx.problem.create({
			data: {
				title: payload.title,
				description: payload.description,
				type: payload.type,
				points: payload.points,
				companyId: finalCompanyId,
				...(payload.testCases &&
					payload.testCases.length > 0 && {
						testCases: {
							create: payload.testCases.map((tc) => ({
								input: tc.input,
								expectedOutput: tc.expectedOutput,
								isHidden: tc.isHidden ?? false,
								weight: tc.weight ?? 1,
							})),
						},
					}),
				...(payload.mcqOptions &&
					payload.mcqOptions.length > 0 && {
						mcqOptions: {
							create: payload.mcqOptions.map((opt) => ({
								text: opt.text,
								isCorrect: opt.isCorrect ?? false,
								order: opt.order,
							})),
						},
					}),
			},
			include: {
				testCases: true,
				mcqOptions: true,
			},
		});

		return problem;
	});
};

const getAllProblems = async (
	query: IProblemFilterQuery,
	caller: ICallerInfo,
) => {
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy || "createdAt";
	const sortOrder = query.sortOrder || "desc";

	const where: Prisma.ProblemWhereInput = {
		deletedAt: null,
	};

	// Non-admin users can only see problems belonging to their own company
	if (caller.role !== "ADMIN") {
		where.companyId = caller.companyId ?? null;
	}

	if (query.type) {
		where.type = query.type;
	}

	if (query.search) {
		where.OR = [
			{ title: { contains: query.search, mode: "insensitive" } },
			{ description: { contains: query.search, mode: "insensitive" } },
		];
	}

	const [total, data] = await Promise.all([
		prisma.problem.count({ where }),
		prisma.problem.findMany({
			where,
			skip,
			take: limit,
			orderBy: {
				[sortBy]: sortOrder,
			},
			include: {
				testCases: {
					select: {
						id: true,
						input: true,
						expectedOutput: true,
						isHidden: true,
						weight: true,
					},
				},
				mcqOptions: {
					select: {
						id: true,
						text: true,
						isCorrect: true,
						order: true,
					},
				},
			},
		}),
	]);

	return {
		meta: {
			page,
			limit,
			total,
		},
		data,
	};
};

const getProblemById = async (id: string, caller: ICallerInfo) => {
	const where: Prisma.ProblemWhereInput = {
		id,
		deletedAt: null,
	};

	// Non-admin users can only access problems belonging to their own company
	if (caller.role !== "ADMIN") {
		where.companyId = caller.companyId ?? null;
	}

	const problem = await prisma.problem.findFirst({
		where,
		include: {
			testCases: true,
			mcqOptions: true,
			company: {
				select: {
					id: true,
					companyName: true,
				},
			},
		},
	});

	if (!problem) {
		throw createError(404, "Problem not found");
	}

	return problem;
};

const updateProblem = async (id: string, payload: IUpdateProblemPayload) => {
	const existing = await prisma.problem.findFirst({
		where: { id, deletedAt: null },
	});

	if (!existing) {
		throw createError(404, "Problem not found");
	}

	return await prisma.$transaction(async (tx) => {
		if (payload.testCases) {
			await tx.testCase.deleteMany({ where: { problemId: id } });
			await tx.testCase.createMany({
				data: payload.testCases.map((tc) => ({
					problemId: id,
					input: tc.input,
					expectedOutput: tc.expectedOutput,
					isHidden: tc.isHidden ?? false,
					weight: tc.weight ?? 1,
				})),
			});
		}

		if (payload.mcqOptions) {
			await tx.mcqOption.deleteMany({ where: { problemId: id } });
			await tx.mcqOption.createMany({
				data: payload.mcqOptions.map((opt) => ({
					problemId: id,
					text: opt.text,
					isCorrect: opt.isCorrect ?? false,
					order: opt.order,
				})),
			});
		}

		const updatedProblem = await tx.problem.update({
			where: { id },
			data: {
				...(payload.title && { title: payload.title }),
				...(payload.description && { description: payload.description }),
				...(payload.points !== undefined && { points: payload.points }),
			},
			include: {
				testCases: true,
				mcqOptions: true,
			},
		});

		return updatedProblem;
	});
};

const deleteProblem = async (id: string) => {
	const existing = await prisma.problem.findFirst({
		where: { id, deletedAt: null },
	});

	if (!existing) {
		throw createError(404, "Problem not found");
	}

	await prisma.problem.update({
		where: { id },
		data: {
			deletedAt: new Date(),
		},
	});

	return null;
};

export const problemService = {
	createProblem,
	getAllProblems,
	getProblemById,
	updateProblem,
	deleteProblem,
};
