import type { Prisma } from "../../../generated/prisma";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../utils/auditLog";
import { createError } from "../../utils/createError";
import { resolveCompanyScope } from "../../utils/scoping";
import type {
	ICallerInfo,
	IEvaluationFilterQuery,
	IGradeSubmissionPayload,
} from "./evaluation.interface";

const getPendingSubmissions = async (
	query: IEvaluationFilterQuery,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;

	const where: Prisma.SubmissionResultWhereInput = {
		status: "PENDING_REVIEW",
		...(scopeCompanyId && {
			submission: {
				attempt: {
					assessment: { companyId: scopeCompanyId },
				},
			},
		}),
	};

	const [total, data] = await Promise.all([
		prisma.submissionResult.count({ where }),
		prisma.submissionResult.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: "asc" }, // oldest pending first — fairness for waiting candidates
			select: {
				id: true,
				score: true,
				maxScore: true,
				status: true,
				createdAt: true,
				submission: {
					select: {
						id: true,
						problem: { select: { id: true, title: true, type: true } },
						attempt: {
							select: {
								id: true,
								candidate: {
									select: { id: true, name: true, email: true },
								},
								assessment: { select: { id: true, title: true } },
							},
						},
					},
				},
			},
		}),
	]);

	return {
		meta: { page, limit, total },
		data,
	};
};

const getSubmissionDetail = async (
	submissionResultId: string,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const result = await prisma.submissionResult.findFirst({
		where: {
			id: submissionResultId,
			...(scopeCompanyId && {
				submission: {
					attempt: {
						assessment: { companyId: scopeCompanyId },
					},
				},
			}),
		},
		include: {
			submission: {
				include: {
					problem: {
						select: {
							id: true,
							title: true,
							description: true,
							type: true,
							testCases: true, // evaluator can see hidden test cases too — candidates never
						},
					},
					selectedOption: true,
					attempt: {
						select: {
							id: true,
							candidate: {
								select: { id: true, name: true, email: true },
							},
							assessment: {
								select: { id: true, title: true, companyId: true },
							},
						},
					},
				},
			},
		},
	});

	if (!result) {
		throw createError(404, "Submission not found");
	}

	return result;
};

const gradeSubmission = async (
	submissionResultId: string,
	payload: IGradeSubmissionPayload,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	return await prisma.$transaction(async (tx) => {
		const result = await tx.submissionResult.findFirst({
			where: {
				id: submissionResultId,
				...(scopeCompanyId && {
					submission: {
						attempt: {
							assessment: { companyId: scopeCompanyId },
						},
					},
				}),
			},
			include: {
				submission: {
					select: { attemptId: true },
				},
			},
		});

		if (!result) {
			throw createError(404, "Submission not found");
		}

		if (result.status !== "PENDING_REVIEW") {
			throw createError(
				400,
				"This submission has already been graded and cannot be changed",
			);
		}

		if (payload.score > result.maxScore) {
			throw createError(
				400,
				`Score cannot exceed the maximum of ${result.maxScore}`,
			);
		}

		const updatedResult = await tx.submissionResult.update({
			where: { id: submissionResultId },
			data: {
				score: payload.score,
				status: payload.status,
				feedback: payload.feedback,
				evaluatedBy: caller.userId,
				evaluatedAt: new Date(),
			},
		});

		// Recompute the parent Attempt's totalScore only once nothing on it is
		// still PENDING_REVIEW — same rule as the auto-grade path in Attempt.
		const attemptId = result.submission.attemptId;
		const siblingResults = await tx.submissionResult.findMany({
			where: { submission: { attemptId } },
			select: { score: true, status: true },
		});

		const stillPending = siblingResults.some(
			(r) => r.status === "PENDING_REVIEW",
		);

		await tx.attempt.update({
			where: { id: attemptId },
			data: {
				totalScore: stillPending
					? null
					: siblingResults.reduce((sum, r) => sum + r.score, 0),
			},
		});

		await writeAuditLog(
			{
				actorId: caller.userId,
				actorRole: caller.role,
				action: "SUBMISSION_GRADED",
				entityType: "SubmissionResult",
				entityId: submissionResultId,
				metadata: { score: payload.score, status: payload.status },
			},
			tx,
		);

		return updatedResult;
	});
};

export const evaluationService = {
	getPendingSubmissions,
	getSubmissionDetail,
	gradeSubmission,
};
