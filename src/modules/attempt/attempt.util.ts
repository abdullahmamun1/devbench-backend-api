import type { Prisma, ProblemType } from "../../../generated/prisma";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../utils/auditLog";
import { createError } from "../../utils/createError";
import type { ICallerInfo, ISubmitAnswerPayload } from "./attempt.interface";

// Grades every problem in the assessment against whatever submissions exist,
// flips the attempt to SUBMITTED, and sets totalScore. Shared by the manual final-submit path and the
// auto-triggered expiry path — grading logic exists in exactly one place.
const finalizeAttempt = async (
	attemptId: string,
	assessmentId: string,
	caller: ICallerInfo,
	trigger: "MANUAL" | "AUTO_EXPIRY",
) => {
	return await prisma.$transaction(async (tx) => {
		const assessmentProblems = await tx.assessmentProblem.findMany({
			where: { assessmentId },
			include: { problem: true },
		});

		const submissions = await tx.submission.findMany({
			where: { attemptId },
			include: { selectedOption: true },
		});

		const submissionByProblemId = new Map(
			submissions.map((s) => [s.problemId, s]),
		);

		let anyPending = false;
		let totalScore = 0;

		for (const ap of assessmentProblems) {
			const submission = submissionByProblemId.get(ap.problemId);
			const maxScore = ap.points;

			if (!submission) {
				const blankSubmission = await tx.submission.create({
					data: { attemptId, problemId: ap.problemId },
				});
				await tx.submissionResult.create({
					data: {
						submissionId: blankSubmission.id,
						score: 0,
						maxScore,
						status: "FAILED",
					},
				});
				continue;
			}

			if (ap.problem.type === "MCQ") {
				const isCorrect = submission.selectedOption?.isCorrect ?? false;
				const score = isCorrect ? maxScore : 0;
				totalScore += score;

				await tx.submissionResult.create({
					data: {
						submissionId: submission.id,
						score,
						maxScore,
						status: isCorrect ? "PASSED" : "FAILED",
					},
				});
			} else if (!submission.answerText && !submission.code) {
				await tx.submissionResult.create({
					data: {
						submissionId: submission.id,
						score: 0,
						maxScore,
						status: "FAILED",
					},
				});
			} else {
				anyPending = true;
				await tx.submissionResult.create({
					data: {
						submissionId: submission.id,
						score: 0,
						maxScore,
						status: "PENDING_REVIEW",
					},
				});
			}
		}

		const updatedAttempt = await tx.attempt.update({
			where: { id: attemptId },
			data: {
				status: "SUBMITTED",
				totalScore: anyPending ? null : totalScore,
			},
		});

		await writeAuditLog(
			{
				actorId: caller.userId,
				actorRole: caller.role,
				action:
					trigger === "MANUAL"
						? "ATTEMPT_SUBMITTED"
						: "ATTEMPT_AUTO_SUBMITTED_ON_EXPIRY",
				entityType: "Attempt",
				entityId: attemptId,
			},
			tx,
		);

		return updatedAttempt;
	});
};

// Checks expiry and auto-finalizes if needed. Returns the current attempt
// either way — call this at the top of every attempt-touching operation so
// expiry is caught no matter which endpoint the candidate hits next.
const ensureNotExpired = async (
	attempt: Prisma.AttemptGetPayload<Record<string, never>>,
	caller: ICallerInfo,
) => {
	if (
		attempt.status === "IN_PROGRESS" &&
		attempt.expiresAt &&
		attempt.expiresAt < new Date()
	) {
		return finalizeAttempt(
			attempt.id,
			attempt.assessmentId,
			caller,
			"AUTO_EXPIRY",
		);
	}
	return attempt;
};

const validateAnswerShape = (
	problemType: ProblemType,
	payload: ISubmitAnswerPayload,
) => {
	if (problemType === "MCQ") {
		if (!payload.selectedOptionId) {
			throw createError(400, "selectedOptionId is required for an MCQ problem");
		}
		if (payload.answerText || payload.code || payload.language) {
			throw createError(400, "MCQ submissions only accept selectedOptionId");
		}
	} else if (problemType === "WRITTEN") {
		if (!payload.answerText) {
			throw createError(400, "answerText is required for a WRITTEN problem");
		}
		if (payload.selectedOptionId || payload.code || payload.language) {
			throw createError(400, "WRITTEN submissions only accept answerText");
		}
	} else {
		if (!payload.code) {
			throw createError(400, "code is required for a CODING problem");
		}
		if (payload.selectedOptionId || payload.answerText) {
			throw createError(
				400,
				"CODING submissions only accept code and language",
			);
		}
	}
};

export const attemptUtil = {
	finalizeAttempt,
	ensureNotExpired,
	validateAnswerShape,
};
