import { Prisma, UserRole } from "../../../generated/prisma";
import { prisma } from "../../lib/prisma";
import { createError } from "../../utils/createError";
import type {
	IAssessmentFilterQuery,
	IAttachProblemPayload,
	ICallerInfo,
	ICreateAssessmentPayload,
	IUpdateAssessmentPayload,
} from "./assessment.interface";

// Assessment.companyId is required (non-nullable).
// Non-admin callers must always have a companyId to touch this resource at all.
const resolveScopeCompanyId = (caller: ICallerInfo): string | undefined => {
	if (caller.role === "ADMIN") {
		return undefined; // no scoping — admin can see/touch any company's assessments
	}

	if (!caller.companyId) {
		throw createError(
			400,
			"You must belong to a company to access assessments",
		);
	}

	return caller.companyId;
};

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

	const scopeCompanyId = resolveScopeCompanyId(caller);

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
	const scopeCompanyId = resolveScopeCompanyId(caller);

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
	const scopeCompanyId = resolveScopeCompanyId(caller);

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

	return updated;
};

const deleteAssessment = async (id: string, caller: ICallerInfo) => {
	const scopeCompanyId = resolveScopeCompanyId(caller);

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

	return null;
};

const attachProblem = async (
	assessmentId: string,
	payload: IAttachProblemPayload,
	caller: ICallerInfo,
) => {};

const detachProblem = async (
	assessmentId: string,
	payload: IAttachProblemPayload,
	caller: ICallerInfo,
) => {};

const publishAssessment = async (id: string, caller: ICallerInfo) => {};

export const assessmentService = {
	createAssessment,
	getAllAssessments,
	getAssessmentById,
	updateAssessment,
	deleteAssessment,
	attachProblem,
	detachProblem,
	publishAssessment,
};
