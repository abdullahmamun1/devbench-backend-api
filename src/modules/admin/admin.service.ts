import type { Prisma } from "../../../generated/prisma";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
import { writeAuditLog } from "../../utils/auditLog";
import { createError } from "../../utils/createError";
import { monthKey } from "../../utils/monthKey";
import type {
	IAuditLogFilterQuery,
	ICallerInfo,
	ICreditAdjustPayload,
	IListQuery,
	IPlatformTrendPoint,
} from "./admin.interface";

const listCompanies = async (query: IListQuery) => {
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;

	const status =
		query.status === "ACTIVE" || query.status === "SUSPENDED"
			? query.status
			: undefined;

	const where: Prisma.CompanyWhereInput = {
		deletedAt: null,
		...(status && { status }),
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

	const status =
		query.status === "ACTIVE" || query.status === "SUSPENDED"
			? query.status
			: undefined;

	const where: Prisma.UserWhereInput = {
		role: "CANDIDATE",
		isDeleted: false,
		...(status && { status }),
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
		actorRole: caller.role,
		action: "COMPANY_SUSPENDED",
		entityType: "Company",
		entityId: companyId,
	});

	return updated;
};

const suspendUser = async (userId: string, caller: ICallerInfo) => {
	if (userId === caller.userId) {
		throw createError(400, "You cannot suspend your own account");
	}

	const user = await prisma.user.findFirst({
		where: { id: userId, isDeleted: false },
	});

	if (!user) {
		throw createError(404, "User not found");
	}

	if (user.status === "SUSPENDED") {
		throw createError(400, "This user is already suspended");
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { status: "SUSPENDED" },
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "USER_SUSPENDED",
		entityType: "User",
		entityId: userId,
		metadata: { targetRole: user.role },
	});

	return updated;
};

const reactivateCompany = async (companyId: string, caller: ICallerInfo) => {
	const company = await prisma.company.findFirst({
		where: { id: companyId, deletedAt: null },
	});

	if (!company) {
		throw createError(404, "Company not found");
	}

	if (company.status !== "SUSPENDED") {
		throw createError(400, "This company is not suspended");
	}

	const updated = await prisma.company.update({
		where: { id: companyId },
		data: { status: "ACTIVE" },
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "COMPANY_REACTIVATED",
		entityType: "Company",
		entityId: companyId,
	});

	return updated;
};

const reactivateUser = async (userId: string, caller: ICallerInfo) => {
	const user = await prisma.user.findFirst({
		where: { id: userId, isDeleted: false },
	});

	if (!user) {
		throw createError(404, "User not found");
	}

	// Deleted accounts stay deleted. Only a suspension can be lifted.
	if (user.status !== "SUSPENDED") {
		throw createError(400, "This user is not suspended");
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { status: "ACTIVE" },
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "USER_REACTIVATED",
		entityType: "User",
		entityId: userId,
		metadata: { targetRole: user.role },
	});

	return updated;
};

const deleteUser = async (userId: string, caller: ICallerInfo) => {
	if (userId === caller.userId) {
		throw createError(400, "You cannot delete your own account");
	}

	const user = await prisma.user.findFirst({
		where: { id: userId, isDeleted: false },
	});

	if (!user) {
		throw createError(404, "User not found");
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: {
			isDeleted: true,
			deletedAt: new Date(),
			status: "DELETED",
		},
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "USER_DELETED",
		entityType: "User",
		entityId: userId,
		metadata: { targetRole: user.role },
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
	const cached = await redis.get<{
		companyCount: number;
		candidateCount: number;
		assessmentsRun: number;
		revenueInCents: number;
	}>(config.platform_stats_cache_key);

	if (cached) {
		return cached;
	}
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

	const stats = {
		companyCount,
		candidateCount,
		assessmentsRun: attemptsRun,
		revenueInCents: revenueResult._sum.amount ?? 0,
	};

	await redis.set(config.platform_stats_cache_key, stats, {
		ex: Number(config.platform_stats_cache_ttl_seconds),
	});

	return stats;
};

const getPlatformTrends = async (): Promise<IPlatformTrendPoint[]> => {
	const months = Number(config.trend_months) || 6;
	const cacheKey = `${config.platform_stats_cache_key}:trends`;
	const cached = await redis.get<IPlatformTrendPoint[]>(cacheKey);
	if (cached) {
		return cached;
	}

	const now = new Date();
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
	);

	const [companies, candidates, attempts, payments] = await Promise.all([
		prisma.company.findMany({
			where: { deletedAt: null, createdAt: { gte: start } },
			select: { createdAt: true },
		}),
		prisma.user.findMany({
			where: { role: "CANDIDATE", isDeleted: false, createdAt: { gte: start } },
			select: { createdAt: true },
		}),
		prisma.attempt.findMany({
			where: { status: "SUBMITTED", createdAt: { gte: start } },
			select: { createdAt: true },
		}),
		prisma.payment.findMany({
			where: { status: "SUCCEEDED", createdAt: { gte: start } },
			select: { createdAt: true, amount: true },
		}),
	]);

	// One bucket per month, zero filled, so empty months still show on the chart.
	const points = new Map<string, IPlatformTrendPoint>();
	for (let i = 0; i < months; i++) {
		const date = new Date(
			Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
		);
		const key = monthKey(date);
		points.set(key, {
			month: key,
			companies: 0,
			candidates: 0,
			attempts: 0,
			revenueInCents: 0,
		});
	}

	for (const row of companies) {
		const point = points.get(monthKey(row.createdAt));
		if (point) point.companies += 1;
	}
	for (const row of candidates) {
		const point = points.get(monthKey(row.createdAt));
		if (point) point.candidates += 1;
	}
	for (const row of attempts) {
		const point = points.get(monthKey(row.createdAt));
		if (point) point.attempts += 1;
	}
	for (const row of payments) {
		const point = points.get(monthKey(row.createdAt));
		if (point) point.revenueInCents += row.amount;
	}

	const trends = [...points.values()];

	await redis.set(cacheKey, trends, {
		ex: Number(config.platform_stats_cache_ttl_seconds),
	});

	return trends;
};

const adjustCredits = async (
	payload: ICreditAdjustPayload,
	caller: ICallerInfo,
) => {
	return await prisma.$transaction(async (tx) => {
		const company = await tx.company.findFirst({
			where: { id: payload.companyId, deletedAt: null },
		});

		if (!company) {
			throw createError(404, "Company not found");
		}

		const newBalance = company.creditBalance + payload.amount;

		if (newBalance < 0) {
			throw createError(
				400,
				`Adjustment would result in a negative balance (current: ${company.creditBalance})`,
			);
		}

		const updatedCompany = await tx.company.update({
			where: { id: payload.companyId },
			data: { creditBalance: newBalance },
		});

		await tx.creditTransaction.create({
			data: {
				companyId: payload.companyId,
				type: "ADJUSTMENT",
				amount: payload.amount,
				balanceAfter: newBalance,
			},
		});

		await writeAuditLog(
			{
				actorId: caller.userId,
				actorRole: caller.role,
				action: "CREDIT_ADJUSTED",
				entityType: "Company",
				entityId: payload.companyId,
				metadata: {
					amount: payload.amount,
					reason: payload.reason,
					newBalance,
				},
			},
			tx,
		);

		return updatedCompany;
	});
};

export const adminService = {
	listCompanies,
	listCandidates,
	suspendCompany,
	suspendUser,
	reactivateCompany,
	reactivateUser,
	deleteUser,
	getAuditLogs,
	getPlatformStats,
	getPlatformTrends,
	adjustCredits,
};
