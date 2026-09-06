import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../utils/auditLog";
import { createError } from "../../utils/createError";
import { resolveCompanyScope } from "../../utils/scoping";
import type {
	IAssessmentFilterQuery,
	IAttachProblemPayload,
	ICallerInfo,
	ICreateAssessmentPayload,
	IUpdateAssessmentPayload,
} from "./assessment.interface";

const createAssessment = async (
	payload: ICreateAssessmentPayload,
	caller: ICallerInfo,
) => {
	if (!caller.companyId) {
		throw createError(
			400,
			"You must belong to a company to create an assessment",
		);
	}

	const assessment = await prisma.assessment.create({
		data: {
			companyId: caller.companyId,
			title: payload.title,
			description: payload.description,
			durationMinutes: payload.durationMinutes,
			passingScore: payload.passingScore,
		},
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "ASSESSMENT_CREATED",
		entityType: "Assessment",
		entityId: assessment.id,
	});

	return assessment;
};

const getAllAssessments = async (
	query: IAssessmentFilterQuery,
	caller: ICallerInfo,
) => {
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy || "createdAt";
	const sortOrder = query.sortOrder || "desc";

	const scopeCompanyId = resolveCompanyScope(caller);

	const where: Prisma.AssessmentWhereInput = {
		deletedAt: null,
		...(scopeCompanyId && { companyId: scopeCompanyId }),
	};

	if (query.status) {
		where.status = query.status;
	}

	const [total, data] = await Promise.all([
		prisma.assessment.count({ where }),
		prisma.assessment.findMany({
			where,
			skip,
			take: limit,
			orderBy: {
				[sortBy]: sortOrder,
			},
			include: {
				_count: {
					select: {
						assessmentProblems: true,
						invitations: true,
					},
				},
			},
		}),
	]);

	return {
		data,
		meta: {
			page,
			limit,
			total,
		},
	};
};

const getAssessmentById = async (id: string, caller: ICallerInfo) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const assessment = await prisma.assessment.findFirst({
		where: {
			id,
			deletedAt: null,
			...(scopeCompanyId && { companyId: scopeCompanyId }),
		},
		include: {
			assessmentProblems: {
				orderBy: { order: "asc" },
				include: {
					problem: {
						select: {
							id: true,
							title: true,
							type: true,
							points: true,
						},
					},
				},
			},
			_count: {
				select: {
					invitations: true,
				},
			},
		},
	});

	if (!assessment) {
		throw createError(404, "Assessment not found");
	}

	return assessment;
};

const updateAssessment = async (
	id: string,
	payload: IUpdateAssessmentPayload,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const existing = await prisma.assessment.findFirst({
		where: {
			id,
			deletedAt: null,
			...(scopeCompanyId && { companyId: scopeCompanyId }),
		},
		include: {
			_count: {
				select: { invitations: true },
			},
		},
	});

	if (!existing) {
		throw createError(404, "Assessment not found");
	}

	// Once invitations exist, duration can no longer change.
	// Title/description/passingScore stay editable.
	if (
		payload.durationMinutes !== undefined &&
		existing._count.invitations > 0
	) {
		throw createError(
			400,
			"Cannot change duration after invitations have been sent",
		);
	}

	const updated = await prisma.assessment.update({
		where: { id },
		data: {
			...(payload.title && { title: payload.title }),
			...(payload.description !== undefined && {
				description: payload.description,
			}),
			...(payload.durationMinutes !== undefined && {
				durationMinutes: payload.durationMinutes,
			}),
			...(payload.passingScore !== undefined && {
				passingScore: payload.passingScore,
			}),
		},
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "ASSESSMENT_UPDATED",
		entityType: "Assessment",
		entityId: id,
	});

	return updated;
};

const deleteAssessment = async (id: string, caller: ICallerInfo) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const existing = await prisma.assessment.findFirst({
		where: {
			id,
			deletedAt: null,
			...(scopeCompanyId && { companyId: scopeCompanyId }),
		},
	});

	if (!existing) {
		throw createError(404, "Assessment not found");
	}

	await prisma.assessment.update({
		where: { id },
		data: {
			deletedAt: new Date(),
		},
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "ASSESSMENT_DELETED",
		entityType: "Assessment",
		entityId: id,
	});

	return null;
};

const attachProblem = async (
	assessmentId: string,
	payload: IAttachProblemPayload,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const assessment = await prisma.assessment.findFirst({
		where: {
			id: assessmentId,
			deletedAt: null,
			...(scopeCompanyId && { companyId: scopeCompanyId }),
		},
		include: {
			_count: { select: { invitations: true } },
		},
	});

	if (!assessment) {
		throw createError(404, "Assessment not found");
	}

	if (assessment._count.invitations > 0) {
		throw createError(
			400,
			"Cannot modify problems after invitations have been sent",
		);
	}

	// Problem must belong to the same company so a company can't attach
	// another company's private problem to their assessment.
	const problem = await prisma.problem.findFirst({
		where: {
			id: payload.problemId,
			deletedAt: null,
			...(caller.role !== "ADMIN" && {
				companyId: assessment.companyId,
			}),
		},
	});

	if (!problem) {
		throw createError(404, "Problem not found");
	}

	const existingLink = await prisma.assessmentProblem.findFirst({
		where: { assessmentId, problemId: payload.problemId },
	});

	if (existingLink) {
		throw createError(
			400,
			"This problem is already attached to the assessment",
		);
	}

	const link = await prisma.assessmentProblem.create({
		data: {
			assessmentId,
			problemId: payload.problemId,
			order: payload.order,
			points: payload.points,
		},
		include: {
			problem: {
				select: { id: true, title: true, type: true },
			},
		},
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "PROBLEM_ATTACHED_TO_ASSESSMENT",
		entityType: "Assessment",
		entityId: assessmentId,
		metadata: { problemId: payload.problemId },
	});

	return link;
};

const detachProblem = async (
	assessmentId: string,
	problemId: string,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const assessment = await prisma.assessment.findFirst({
		where: {
			id: assessmentId,
			deletedAt: null,
			...(scopeCompanyId && { companyId: scopeCompanyId }),
		},
		include: {
			_count: { select: { invitations: true } },
		},
	});

	if (!assessment) {
		throw createError(404, "Assessment not found");
	}

	if (assessment._count.invitations > 0) {
		throw createError(
			400,
			"Cannot modify problems after invitations have been sent",
		);
	}

	const link = await prisma.assessmentProblem.findFirst({
		where: { assessmentId, problemId },
	});

	if (!link) {
		throw createError(404, "This problem is not attached to the assessment");
	}

	await prisma.assessmentProblem.delete({ where: { id: link.id } });

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "PROBLEM_DETACHED_FROM_ASSESSMENT",
		entityType: "Assessment",
		entityId: assessmentId,
		metadata: { problemId },
	});

	return null;
};

const publishAssessment = async (id: string, caller: ICallerInfo) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	return await prisma.$transaction(async (tx) => {
		const assessment = await tx.assessment.findFirst({
			where: {
				id,
				deletedAt: null,
				...(scopeCompanyId && { companyId: scopeCompanyId }),
			},
			include: {
				_count: { select: { assessmentProblems: true } },
			},
		});

		if (!assessment) {
			throw createError(404, "Assessment not found");
		}

		if (assessment.status !== "DRAFT") {
			throw createError(
				400,
				`Assessment is already ${assessment.status.toLowerCase()}`,
			);
		}

		if (assessment._count.assessmentProblems === 0) {
			throw createError(
				400,
				"Cannot publish an assessment with no attached problems",
			);
		}

		const published = await tx.assessment.update({
			where: { id },
			data: { status: "PUBLISHED" },
		});
		await writeAuditLog(
			{
				actorId: caller.userId,
				actorRole: caller.role,
				action: "ASSESSMENT_PUBLISHED",
				entityType: "Assessment",
				entityId: id,
			},
			tx,
		);

		return published;
	});
};

const getAssessmentResults = async (
	assessmentId: string,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const assessment = await prisma.assessment.findFirst({
		where: {
			id: assessmentId,
			deletedAt: null,
			...(scopeCompanyId && { companyId: scopeCompanyId }),
		},
	});

	if (!assessment) {
		throw createError(404, "Assessment not found");
	}

	const attempts = await prisma.attempt.findMany({
		where: { assessmentId },
		orderBy: { totalScore: "desc" },
		select: {
			id: true,
			status: true,
			totalScore: true,
			startedAt: true,
			candidate: { select: { id: true, name: true, email: true } },
			submissions: {
				select: {
					problemId: true,
					submissionResult: {
						select: { score: true, maxScore: true, status: true },
					},
				},
			},
		},
	});

	return {
		assessment: {
			id: assessment.id,
			title: assessment.title,
			passingScore: assessment.passingScore,
		},
		results: attempts.map((a) => ({
			attemptId: a.id,
			candidate: a.candidate,
			status: a.status,
			totalScore: a.totalScore,
			passed:
				a.totalScore !== null ? a.totalScore >= assessment.passingScore : null,
			startedAt: a.startedAt,
			submissions: a.submissions,
		})),
	};
};

export const assessmentService = {
	createAssessment,
	getAllAssessments,
	getAssessmentById,
	updateAssessment,
	deleteAssessment,
	attachProblem,
	detachProblem,
	publishAssessment,
	getAssessmentResults,
};
