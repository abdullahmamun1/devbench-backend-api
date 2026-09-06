import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../utils/auditLog";
import { createError } from "../../utils/createError";
import type {
	IAuditLogFilterQuery,
	ICallerInfo,
	ICreditAdjustPayload,
	IListQuery,
} from "./admin.interface";

const listCompanies = async (query: IListQuery) => {
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;

	const where: Prisma.CompanyWhereInput = {
		deletedAt: null,
		...(query.search && {
			companyName: { contains: query.search, mode: "insensitive" },
		}),
	};

	const [total, data] = await Promise.all([
		prisma.company.count({ where }),
		prisma.company.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				companyName: true,
				status: true,
				creditBalance: true,
				createdAt: true,
				_count: { select: { users: true, assessments: true } },
			},
		}),
	]);

	return { meta: { page, limit, total }, data };
};

const listCandidates = async (query: IListQuery) => {
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;

	const where: Prisma.UserWhereInput = {
		role: "CANDIDATE",
		isDeleted: false,
		...(query.search && {
			OR: [
				{ name: { contains: query.search, mode: "insensitive" } },
				{ email: { contains: query.search, mode: "insensitive" } },
			],
		}),
	};

	const [total, data] = await Promise.all([
		prisma.user.count({ where }),
		prisma.user.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				name: true,
				email: true,
				status: true,
				emailVerified: true,
				createdAt: true,
				_count: { select: { attempts: true } },
			},
		}),
	]);

	return { meta: { page, limit, total }, data };
};

const suspendCompany = async (companyId: string, caller: ICallerInfo) => {
	const company = await prisma.company.findFirst({
		where: { id: companyId, deletedAt: null },
	});

	if (!company) {
		throw createError(404, "Company not found");
	}

	if (company.status === "SUSPENDED") {
		throw createError(400, "This company is already suspended");
	}

	const updated = await prisma.company.update({
		where: { id: companyId },
		data: { status: "SUSPENDED" },
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role as never,
		action: "COMPANY_SUSPENDED",
		entityType: "Company",
		entityId: companyId,
	});

	return updated;
};

const suspendCandidate = async (candidateId: string, caller: ICallerInfo) => {
	const candidate = await prisma.user.findFirst({
		where: { id: candidateId, role: "CANDIDATE", isDeleted: false },
	});

	if (!candidate) {
		throw createError(404, "Candidate not found");
	}

	if (candidate.status === "SUSPENDED") {
		throw createError(400, "This candidate is already suspended");
	}

	const updated = await prisma.user.update({
		where: { id: candidateId },
		data: { status: "SUSPENDED" },
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role as never,
		action: "CANDIDATE_SUSPENDED",
		entityType: "User",
		entityId: candidateId,
	});

	return updated;
};

const getAuditLogs = async (query: IAuditLogFilterQuery) => {
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 20;
	const skip = (page - 1) * limit;

	const where: Prisma.AuditLogWhereInput = {
		...(query.entityType && { entityType: query.entityType }),
		...(query.entityId && { entityId: query.entityId }),
	};

	const [total, data] = await Promise.all([
		prisma.auditLog.count({ where }),
		prisma.auditLog.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: "desc" },
			include: {
				actor: {
					select: { id: true, name: true, email: true, role: true },
				},
			},
		}),
	]);

	return { meta: { page, limit, total }, data };
};

const getPlatformStats = async () => {
	const [companyCount, candidateCount, attemptsRun, revenueResult] =
		await Promise.all([
			prisma.company.count({ where: { deletedAt: null } }),
			prisma.user.count({
				where: { role: "CANDIDATE", isDeleted: false },
			}),
			prisma.attempt.count({ where: { status: "SUBMITTED" } }),
			prisma.payment.aggregate({
				where: { status: "SUCCEEDED" },
				_sum: { amount: true },
			}),
		]);

	return {
		companyCount,
		candidateCount,
		assessmentsRun: attemptsRun,
		revenueInCents: revenueResult._sum.amount ?? 0,
	};
};

const adjustCredits = async (
	payload: ICreditAdjustPayload,
	caller: ICallerInfo,
) => {};

export const adminService = {
	listCompanies,
	listCandidates,
	suspendCompany,
	suspendCandidate,
	getAuditLogs,
	getPlatformStats,
	adjustCredits,
};
