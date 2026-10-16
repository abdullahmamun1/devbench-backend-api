import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
import { createError } from "../../utils/createError";
import { resolveCompanyScope } from "../../utils/scoping";
import type { ICallerInfo } from "./insights.interface";
import { insightsUtil } from "./insights.util";
import {
	commonFingerprints,
	compare,
	fingerprintSet,
	similarityLevel,
} from "./similarity";

// When the candidate stopped working. An attempt that expired is finalized
// lazily, so its updatedAt can be much later than the real end.
const attemptEnd = (attempt: {
	status: string;
	updatedAt: Date;
	expiresAt: Date | null;
}) => {
	const cap = attempt.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
	const last =
		attempt.status === "SUBMITTED" ? attempt.updatedAt.getTime() : Date.now();
	return new Date(Math.min(last, cap));
};

const getAttemptSignals = async (attemptId: string, caller: ICallerInfo) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const attempt = await prisma.attempt.findFirst({
		where: {
			id: attemptId,
			...(scopeCompanyId && { assessment: { companyId: scopeCompanyId } }),
		},
		select: {
			id: true,
			status: true,
			startedAt: true,
			expiresAt: true,
			updatedAt: true,
			events: {
				orderBy: { occurredAt: "asc" },
				select: { type: true, problemId: true, occurredAt: true, meta: true },
			},
		},
	});

	if (!attempt) {
		throw createError(404, "Attempt not found");
	}

	const endAt = attemptEnd(attempt);
	const summary = insightsUtil.summarizeSignals(
		attempt.events.map((e) => ({
			type: e.type,
			problemId: e.problemId,
			occurredAt: e.occurredAt,
			chars:
				e.meta && typeof e.meta === "object" && "chars" in e.meta
					? Number(e.meta.chars) || 0
					: undefined,
		})),
		endAt,
	);

	return {
		attemptId: attempt.id,
		status: attempt.status,
		startedAt: attempt.startedAt,
		endedAt: attempt.status === "SUBMITTED" ? endAt : null,
		// Old attempts predate signal logging; the UI says "no data" instead of "clean"
		hasSignals: attempt.events.length > 0,
		...summary,
	};
};

const SIMILARITY_TTL_SECONDS = 600;
const MAX_COMPARED = 300;

// Compares one coding or written answer with every other answer to the same
// problem in the same company, and returns the closest matches.
const getSubmissionSimilarity = async (
	submissionId: string,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const submission = await prisma.submission.findFirst({
		where: {
			id: submissionId,
			...(scopeCompanyId && {
				attempt: { assessment: { companyId: scopeCompanyId } },
			}),
		},
		select: {
			id: true,
			code: true,
			answerText: true,
			problemId: true,
			attemptId: true,
			problem: { select: { type: true } },
			attempt: { select: { assessment: { select: { companyId: true } } } },
		},
	});

	if (!submission) {
		throw createError(404, "Submission not found");
	}

	if (submission.problem.type === "MCQ") {
		return { applicable: false as const };
	}

	const cacheKey = `insights:similarity:${submission.id}`;
	const cached = await redis.get(cacheKey);
	if (cached) return cached;

	const mode = submission.problem.type === "CODING" ? "code" : "text";
	const content =
		(mode === "code" ? submission.code : submission.answerText) ?? "";

	const others = await prisma.submission.findMany({
		where: {
			problemId: submission.problemId,
			id: { not: submission.id },
			attemptId: { not: submission.attemptId },
			attempt: {
				assessment: { companyId: submission.attempt.assessment.companyId },
			},
			...(mode === "code"
				? { code: { not: null } }
				: { answerText: { not: null } }),
		},
		orderBy: { submittedAt: "desc" },
		take: MAX_COMPARED,
		select: {
			id: true,
			code: true,
			answerText: true,
			language: true,
			attempt: {
				select: {
					id: true,
					candidate: { select: { id: true, name: true, email: true } },
					assessment: { select: { id: true, title: true } },
				},
			},
		},
	});

	const contentOf = (o: (typeof others)[number]) =>
		(mode === "code" ? o.code : o.answerText) ?? "";
	// Code that many candidates share (the textbook approach, input parsing)
	// is not evidence of copying, so it is set aside before scoring
	const common = commonFingerprints([
		fingerprintSet(content, mode),
		...others.map((o) => fingerprintSet(contentOf(o), mode)),
	]);

	const matches = others
		.map((other) => {
			const otherContent = contentOf(other);
			const result = compare(content, otherContent, mode, common);
			return { other, otherContent, result };
		})
		.filter(({ result }) => result.comparable && result.score > 0)
		.sort((a, b) => b.result.score - a.result.score)
		.slice(0, 3)
		.map(({ other, otherContent, result }) => ({
			submissionId: other.id,
			attemptId: other.attempt.id,
			candidate: other.attempt.candidate,
			assessment: other.attempt.assessment,
			language: other.language,
			content: otherContent,
			score: Math.round(result.score * 100),
			level: similarityLevel(result.score),
			matchesSelf: result.matchesA,
			matchesOther: result.matchesB,
		}));

	const response = {
		applicable: true as const,
		mode,
		// False when this answer is too short to compare meaningfully
		comparable: compare(content, content, mode).comparable,
		comparedWith: others.length,
		commonCodeFiltered: common.size > 0,
		matches,
	};

	await redis.set(cacheKey, response, { ex: SIMILARITY_TTL_SECONDS });
	return response;
};

// Loads everything item analysis needs for one assessment
const loadAssessmentData = async (
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
		select: {
			id: true,
			title: true,
			passingScore: true,
			durationMinutes: true,
			assessmentProblems: {
				orderBy: { order: "asc" },
				select: {
					points: true,
					problem: { select: { id: true, title: true, type: true } },
				},
			},
			attempts: {
				where: { status: "SUBMITTED" },
				select: {
					id: true,
					totalScore: true,
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
			},
		},
	});

	if (!assessment) {
		throw createError(404, "Assessment not found");
	}

	const problems = assessment.assessmentProblems.map((ap) => ({
		id: ap.problem.id,
		title: ap.problem.title,
		type: ap.problem.type,
		points: ap.points,
	}));

	const attempts = assessment.attempts.map((attempt) => ({
		attemptId: attempt.id,
		candidate: attempt.candidate,
		totalScore: attempt.totalScore,
		problemScores: Object.fromEntries(
			attempt.submissions
				// Answers still waiting for review have no score yet, so leave them out
				.filter(
					(s) =>
						s.submissionResult &&
						s.submissionResult.status !== "PENDING_REVIEW" &&
						s.submissionResult.maxScore > 0,
				)
				.map((s) => [
					s.problemId,
					(s.submissionResult?.score ?? 0) /
						(s.submissionResult?.maxScore ?? 1),
				]),
		),
	}));

	return { assessment, problems, attempts };
};

const getAssessmentInsights = async (
	assessmentId: string,
	caller: ICallerInfo,
) => {
	const { assessment, problems, attempts } = await loadAssessmentData(
		assessmentId,
		caller,
	);
	return {
		assessmentId: assessment.id,
		...insightsUtil.analyzeAssessment(
			problems,
			attempts,
			assessment.passingScore,
		),
	};
};

const percent = (part: number, whole: number) =>
	whole > 0 ? Math.round((part / whole) * 100) : 0;

const TYPE_LABEL = {
	CODING: "coding",
	MCQ: "multiple choice",
	WRITTEN: "written",
} as const;

// One candidate's attempt in context: rank, score by problem type, time per
// question and a plain-language summary built from those numbers.
const getAttemptInsights = async (attemptId: string, caller: ICallerInfo) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const attempt = await prisma.attempt.findFirst({
		where: {
			id: attemptId,
			...(scopeCompanyId && { assessment: { companyId: scopeCompanyId } }),
		},
		select: {
			id: true,
			status: true,
			startedAt: true,
			expiresAt: true,
			updatedAt: true,
			totalScore: true,
			assessmentId: true,
			events: {
				select: { type: true, problemId: true, occurredAt: true, meta: true },
			},
		},
	});

	if (!attempt) {
		throw createError(404, "Attempt not found");
	}

	const { assessment, problems, attempts } = await loadAssessmentData(
		attempt.assessmentId,
		caller,
	);
	const analysis = insightsUtil.analyzeAssessment(
		problems,
		attempts,
		assessment.passingScore,
	);
	const placing =
		analysis.ranking.find((r) => r.attemptId === attempt.id) ?? null;
	const mine = attempts.find((a) => a.attemptId === attempt.id);

	// Score by problem type, from graded answers only
	const byType = (["CODING", "MCQ", "WRITTEN"] as const)
		.map((type) => {
			const ofType = problems.filter((p) => p.type === type);
			const graded = ofType.filter(
				(p) => mine?.problemScores[p.id] !== undefined,
			);
			const max = graded.reduce((sum, p) => sum + p.points, 0);
			const score = graded.reduce(
				(sum, p) => sum + (mine?.problemScores[p.id] ?? 0) * p.points,
				0,
			);
			return {
				type,
				problemCount: ofType.length,
				gradedCount: graded.length,
				score: Math.round(score * 10) / 10,
				max,
				percent: percent(score, max),
			};
		})
		.filter((t) => t.problemCount > 0);

	const endAt = attemptEnd(attempt);
	const signals = insightsUtil.summarizeSignals(
		attempt.events.map((e) => ({
			type: e.type,
			problemId: e.problemId,
			occurredAt: e.occurredAt,
		})),
		endAt,
	);
	const viewed = new Map(
		signals.perProblem.map((p) => [p.problemId, p.viewedSeconds]),
	);
	const timePerProblem = problems.map((p) => ({
		problemId: p.id,
		title: p.title,
		type: p.type,
		seconds: viewed.get(p.id) ?? null,
	}));
	const totalSeconds = attempt.startedAt
		? Math.max(
				0,
				Math.round((endAt.getTime() - attempt.startedAt.getTime()) / 1000),
			)
		: null;

	// Plain-language summary from fixed templates, no generated text
	const sentences: string[] = [];
	const graded = byType.filter((t) => t.gradedCount > 0);
	if (graded.length >= 2) {
		const best = [...graded].sort((a, b) => b.percent - a.percent)[0];
		const worst = [...graded].sort((a, b) => a.percent - b.percent)[0];
		if (best.percent - worst.percent >= 20) {
			sentences.push(
				`Strongest on ${TYPE_LABEL[best.type]} (${best.percent}%), weakest on ${TYPE_LABEL[worst.type]} (${worst.percent}%).`,
			);
		} else {
			sentences.push(
				`Even across problem types (${worst.percent}% to ${best.percent}%).`,
			);
		}
	} else if (graded.length === 1) {
		sentences.push(
			`Scored ${graded[0].percent}% on ${TYPE_LABEL[graded[0].type]} problems.`,
		);
	}
	if (totalSeconds !== null && attempt.status === "SUBMITTED") {
		sentences.push(
			`Finished in ${Math.max(1, Math.round(totalSeconds / 60))} of ${assessment.durationMinutes} minutes.`,
		);
	}
	if (placing && analysis.finishedCount > 1) {
		sentences.push(
			`Ranked ${placing.rank} of ${analysis.finishedCount} finished candidates.`,
		);
	}

	return {
		attemptId: attempt.id,
		status: attempt.status,
		pending: attempt.status === "SUBMITTED" && attempt.totalScore === null,
		score: attempt.totalScore,
		maxScore: analysis.maxScore,
		passingScore: assessment.passingScore,
		rank: placing?.rank ?? null,
		percentile: placing?.percentile ?? null,
		finishedCount: analysis.finishedCount,
		byType,
		timePerProblem,
		hasTiming: signals.perProblem.some((p) => p.viewedSeconds > 0),
		totalSeconds,
		durationMinutes: assessment.durationMinutes,
		summary: sentences.join(" "),
	};
};

export const insightsService = {
	getAttemptSignals,
	getSubmissionSimilarity,
	getAssessmentInsights,
	getAttemptInsights,
};
