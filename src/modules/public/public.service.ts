import config from "../../config";
import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
import type { IPublicStats } from "./public.interface";

const CACHE_KEY = "public:stats";

// Platform-wide totals for the landing page. Aggregate counts only, never
// anything that identifies a company, candidate or assessment.
const getPublicStats = async (): Promise<IPublicStats> => {
	const cached = await redis.get<IPublicStats>(CACHE_KEY);

	if (cached) {
		return cached;
	}

	const [
		problemCount,
		publishedAssessmentCount,
		completedAttemptCount,
		gradedAnswerCount,
		companyCount,
	] = await Promise.all([
		prisma.problem.count({ where: { deletedAt: null } }),
		prisma.assessment.count({
			where: { deletedAt: null, status: { in: ["PUBLISHED", "CLOSED"] } },
		}),
		prisma.attempt.count({ where: { status: "SUBMITTED" } }),
		prisma.submissionResult.count({
			where: { status: { not: "PENDING_REVIEW" } },
		}),
		prisma.company.count({ where: { deletedAt: null, status: "ACTIVE" } }),
	]);

	const stats = {
		problemCount,
		publishedAssessmentCount,
		completedAttemptCount,
		gradedAnswerCount,
		companyCount,
	};

	await redis.set(CACHE_KEY, stats, {
		ex: Number(config.platform_stats_cache_ttl_seconds),
	});

	return stats;
};

export const publicService = {
	getPublicStats,
};
