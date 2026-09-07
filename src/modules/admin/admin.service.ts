import type { Prisma } from "../../../generated/prisma";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
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
				actorRole: caller.role as never,
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
	deleteUser,
	getAuditLogs,
	getPlatformStats,
	adjustCredits,
};
