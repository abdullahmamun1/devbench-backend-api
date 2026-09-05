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

const startAttempt = async (assessmentId: string, caller: ICallerInfo) => {
	const assessment = await prisma.assessment.findFirst({
		where: { id: assessmentId, deletedAt: null, status: "PUBLISHED" },
	});

	if (!assessment) {
		throw createError(404, "Assessment not found or not published");
	}

	const invitation = await prisma.invitation.findFirst({
		where: {
			assessmentId,
			candidateId: caller.userId,
			status: "ACCEPTED",
		},
	});

	if (!invitation) {
		throw createError(403, "You have not been invited to this assessment");
	}

	const existingAttempt = await prisma.attempt.findUnique({
		where: {
			assessmentId_candidateId: {
				assessmentId,
				candidateId: caller.userId,
			},
		},
	});

	if (existingAttempt) {
		const current = await ensureNotExpired(existingAttempt, caller);
		if (current.status === "IN_PROGRESS") {
			return current; // resume
		}
		throw createError(400, "You have already submitted this assessment");
	}

	const now = new Date();
	const expiresAt = new Date(
		now.getTime() + assessment.durationMinutes * 60 * 1000,
	);

	const attempt = await prisma.attempt.create({
		data: {
			assessmentId,
			candidateId: caller.userId,
			status: "IN_PROGRESS",
			startedAt: now,
			expiresAt,
		},
	});

	return attempt;
};

const getAttemptById = async (attemptId: string, caller: ICallerInfo) => {
	const found = await prisma.attempt.findFirst({
		where: { id: attemptId, candidateId: caller.userId },
	});

	if (!found) {
		throw createError(404, "Attempt not found");
	}

	const attempt = await ensureNotExpired(found, caller);

	const assessment = await prisma.assessment.findUniqueOrThrow({
		where: { id: attempt.assessmentId },
		include: {
			assessmentProblems: {
				orderBy: { order: "asc" },
				include: {
					problem: {
						select: {
							id: true,
							type: true,
							title: true,
							description: true,
							testCases: {
								where: { isHidden: false },
								select: { id: true, input: true, expectedOutput: true },
							},
							mcqOptions: {
								orderBy: { order: "asc" },
								select: { id: true, text: true, order: true },
							},
						},
					},
				},
			},
		},
	});

	const submissions = await prisma.submission.findMany({
		where: { attemptId: attempt.id },
		select: {
			problemId: true,
			selectedOptionId: true,
			answerText: true,
			code: true,
			language: true,
		},
	});

	const remainingSeconds =
		attempt.status === "IN_PROGRESS" && attempt.expiresAt
			? Math.max(
					0,
					Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000),
				)
			: 0;

	return {
		id: attempt.id,
		status: attempt.status,
		startedAt: attempt.startedAt,
		expiresAt: attempt.expiresAt,
		remainingSeconds,
		totalScore: attempt.totalScore,
		problems: assessment.assessmentProblems.map((ap) => ({
			problemId: ap.problemId,
			order: ap.order,
			points: ap.points,
			problem: ap.problem,
		})),
		submissions,
	};
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

const upsertSubmission = async (
	attemptId: string,
	payload: ISubmitAnswerPayload,
	caller: ICallerInfo,
) => {
	const found = await prisma.attempt.findFirst({
		where: { id: attemptId, candidateId: caller.userId },
	});

	if (!found) {
		throw createError(404, "Attempt not found");
	}

	const attempt = await ensureNotExpired(found, caller);

	if (attempt.status !== "IN_PROGRESS") {
		throw createError(
			400,
			attempt.status === "SUBMITTED"
				? "Your time expired and this attempt was automatically submitted"
				: `This attempt is ${attempt.status.toLowerCase()} and cannot accept answers`,
		);
	}

	const assessmentProblem = await prisma.assessmentProblem.findFirst({
		where: { assessmentId: attempt.assessmentId, problemId: payload.problemId },
		include: { problem: true },
	});

	if (!assessmentProblem) {
		throw createError(404, "This problem is not part of this assessment");
	}

	validateAnswerShape(assessmentProblem.problem.type, payload);

	return prisma.submission.upsert({
		where: {
			attemptId_problemId: { attemptId, problemId: payload.problemId },
		},
		create: {
			attemptId,
			problemId: payload.problemId,
			selectedOptionId: payload.selectedOptionId,
			answerText: payload.answerText,
			code: payload.code,
			language: payload.language,
		},
		update: {
			selectedOptionId: payload.selectedOptionId ?? null,
			answerText: payload.answerText ?? null,
			code: payload.code ?? null,
			language: payload.language ?? null,
		},
	});
};

const finalSubmit = async (attemptId: string, caller: ICallerInfo) => {};

export const attemptService = {
	startAttempt,
	getAttemptById,
	upsertSubmission,
	finalSubmit,
};
