import { prisma } from "../../lib/prisma";
import { createError } from "../../utils/createError";
import type { ICallerInfo, ISubmitAnswerPayload } from "./attempt.interface";
import { attemptUtil } from "./attempt.util";

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
		const current = await attemptUtil.ensureNotExpired(existingAttempt, caller);
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

const getMyAttempts = async (candidateId: string) => {
	return prisma.attempt.findMany({
		where: { candidateId },
		orderBy: { startedAt: "desc" },
		select: {
			id: true,
			status: true,
			startedAt: true,
			expiresAt: true,
			totalScore: true,
			assessment: {
				select: {
					id: true,
					title: true,
					company: { select: { companyName: true } },
				},
			},
		},
	});
};

const getAttemptById = async (attemptId: string, caller: ICallerInfo) => {
	const found = await prisma.attempt.findFirst({
		where: { id: attemptId, candidateId: caller.userId },
	});

	if (!found) {
		throw createError(404, "Attempt not found");
	}

	const attempt = await attemptUtil.ensureNotExpired(found, caller);

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

	const attempt = await attemptUtil.ensureNotExpired(found, caller);

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

	attemptUtil.validateAnswerShape(assessmentProblem.problem.type, payload);

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

const finalSubmit = async (attemptId: string, caller: ICallerInfo) => {
	const found = await prisma.attempt.findFirst({
		where: { id: attemptId, candidateId: caller.userId },
	});

	if (!found) {
		throw createError(404, "Attempt not found");
	}

	if (found.status !== "IN_PROGRESS") {
		const current = await attemptUtil.ensureNotExpired(found, caller);
		throw createError(
			400,
			`This attempt is already ${current.status.toLowerCase()}`,
		);
	}

	if (found.expiresAt && found.expiresAt < new Date()) {
		// Already past expiry — auto-finalize instead of erroring.
		return attemptUtil.finalizeAttempt(
			attemptId,
			found.assessmentId,
			caller,
			"AUTO_EXPIRY",
		);
	}

	return attemptUtil.finalizeAttempt(
		attemptId,
		found.assessmentId,
		caller,
		"MANUAL",
	);
};

export const attemptService = {
	startAttempt,
	getMyAttempts,
	getAttemptById,
	upsertSubmission,
	finalSubmit,
};
