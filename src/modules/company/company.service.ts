import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../utils/auditLog";
import { createError } from "../../utils/createError";
import { monthKey } from "../../utils/monthKey";
import { requireCompanyId } from "../../utils/scoping";
import { trySendMail } from "../../utils/sendMailSafe";
import type {
	ICallerInfo,
	ICreateCompanyPayload,
	IInviteTeamMemberPayload,
	IUpdateCompanyPayload,
} from "./company.interface";

const createCompany = async (
	payload: ICreateCompanyPayload,
	caller: ICallerInfo,
) => {
	const user = await prisma.user.findUnique({ where: { id: caller.userId } });

	if (!user) {
		throw createError(404, "User not found");
	}

	if (user.companyId) {
		throw createError(400, "You already belong to a company");
	}

	return await prisma.$transaction(async (tx) => {
		const company = await tx.company.create({
			data: {
				companyName: payload.companyName,
			},
		});

		await tx.user.update({
			where: { id: caller.userId },
			data: {
				companyId: company.id,
				role: "COMPANY_OWNER",
			},
		});

		await writeAuditLog(
			{
				actorId: caller.userId,
				actorRole: caller.role,
				action: "COMPANY_CREATED",
				entityType: "Company",
				entityId: company.id,
			},
			tx,
		);

		return company;
	});
};

const getMyCompany = async (caller: ICallerInfo) => {
	const companyId = requireCompanyId(caller);

	const company = await prisma.company.findFirst({
		where: { id: companyId, deletedAt: null },
		select: {
			id: true,
			companyName: true,
			creditBalance: true,
			createdAt: true,
			users: {
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
					status: true,
				},
			},
		},
	});

	if (!company) {
		throw createError(404, "Company not found");
	}

	return company;
};

const updateCompany = async (
	payload: IUpdateCompanyPayload,
	caller: ICallerInfo,
) => {
	const companyId = requireCompanyId(caller);

	const company = await prisma.company.findFirst({
		where: { id: companyId, deletedAt: null },
	});

	if (!company) {
		throw createError(404, "Company not found");
	}

	const updated = await prisma.company.update({
		where: { id: companyId },
		data: {
			...(payload.companyName && { companyName: payload.companyName }),
		},
	});

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "COMPANY_UPDATED",
		entityType: "Company",
		entityId: caller.companyId!,
	});

	return updated;
};

const getCredits = async (caller: ICallerInfo) => {
	const companyId = requireCompanyId(caller);

	const company = await prisma.company.findFirst({
		where: { id: companyId, deletedAt: null },
		select: {
			id: true,
			creditBalance: true,
		},
	});

	if (!company) {
		throw createError(404, "Company not found");
	}

	const transactions = await prisma.creditTransaction.findMany({
		where: { companyId },
		orderBy: { createdAt: "desc" },
		take: 20,
	});

	return {
		creditBalance: company.creditBalance,
		recentTransactions: transactions,
	};
};

const inviteTeamMember = async (
	payload: IInviteTeamMemberPayload,
	caller: ICallerInfo,
) => {
	const companyId = requireCompanyId(caller);

	const existingUser = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	if (existingUser?.companyId) {
		throw createError(400, "This user already belongs to a company");
	}

	const pendingInvite = await prisma.teamInvitation.findFirst({
		where: {
			companyId,
			email: payload.email,
			status: "PENDING",
		},
	});

	if (pendingInvite) {
		throw createError(400, "This email already has a pending invitation");
	}

	const token = crypto.randomBytes(32).toString("hex");
	const expiresAt = new Date();
	expiresAt.setDate(
		expiresAt.getDate() + config.team_invitation_expires_in_days,
	);

	const invitation = await prisma.teamInvitation.create({
		data: {
			companyId,
			email: payload.email,
			role: payload.role,
			token,
			expiresAt,
		},
	});

	const inviteLink = `${config.app_url}/team/accept/${token}`;

	const emailSent = await trySendMail({
		from: config.mail_from,
		to: payload.email,
		subject: "You've been invited to join a team on DevBench",
		html: `<p>You've been invited as a <b>${payload.role}</b>. Click <a href="${inviteLink}">here</a> to accept. This link expires in ${config.team_invitation_expires_in_days} days.</p>`,
	});

	if (!emailSent) {
		// Nothing was charged, and there is no resend for team invites,
		// so remove the record to let the owner simply try again.
		await prisma.teamInvitation.delete({ where: { id: invitation.id } });
		throw createError(
			502,
			"We could not send the invitation email. Please try again in a moment.",
		);
	}

	await writeAuditLog({
		actorId: caller.userId,
		actorRole: caller.role,
		action: "TEAM_MEMBER_INVITED",
		entityType: "TeamInvitation",
		entityId: invitation.id,
		metadata: { email: payload.email, role: payload.role },
	});

	const { token: _token, ...safeInvitation } = invitation;
	return safeInvitation;
};

const acceptTeamInvitation = async (
	token: string,
	userId: string | undefined,
	registerPayload?: { name: string; password: string },
) => {
	const invitation = await prisma.teamInvitation.findUnique({
		where: { token },
	});

	if (!invitation) {
		throw createError(404, "Invitation not found");
	}

	if (invitation.status !== "PENDING") {
		throw createError(400, "This invitation is no longer valid");
	}

	if (invitation.expiresAt < new Date()) {
		await prisma.teamInvitation.update({
			where: { id: invitation.id },
			data: { status: "EXPIRED" },
		});
		throw createError(410, "This invitation has expired");
	}

	return await prisma.$transaction(async (tx) => {
		let targetUserId = userId;

		if (!targetUserId) {
			if (!registerPayload?.name || !registerPayload?.password) {
				throw createError(
					400,
					"Name and password are required to accept this invitation",
				);
			}

			const existingAccount = await tx.user.findUnique({
				where: { email: invitation.email },
			});
			if (existingAccount) {
				throw createError(
					409,
					"An account with this email already exists. Log in with it, then open this link again.",
				);
			}

			const passwordHash = await bcrypt.hash(
				registerPayload.password,
				Number(config.bcrypt_salt_rounds) || 12,
			);

			const newUser = await tx.user.create({
				data: {
					name: registerPayload.name,
					email: invitation.email,
					passwordHash,
					role: invitation.role,
					emailVerified: true,
					companyId: invitation.companyId,
				},
			});

			targetUserId = newUser.id;
		} else {
			const existing = await tx.user.findUnique({
				where: { id: targetUserId },
			});

			if (!existing) {
				throw createError(404, "User not found");
			}

			if (existing.email !== invitation.email) {
				throw createError(403, "This invitation was sent to a different email");
			}

			await tx.user.update({
				where: { id: targetUserId },
				data: {
					companyId: invitation.companyId,
					role: invitation.role,
				},
			});
		}

		await tx.teamInvitation.update({
			where: { id: invitation.id },
			data: { status: "ACCEPTED" },
		});

		await writeAuditLog(
			{
				actorId: targetUserId,
				actorRole: invitation.role,
				action: "INVITATION_ACCEPTED",
				entityType: "TeamInvitation",
				entityId: invitation.id,
			},
			tx,
		);

		return tx.user.findUnique({ where: { id: targetUserId } });
	});
};

const ACTIVITY_MONTHS = 6;

// Company dashboard charts: invitations and submissions per month, how
// finished attempts turned out, and the average score by problem type.
const getCompanyActivity = async (caller: ICallerInfo) => {
	const companyId = caller.companyId;
	if (!companyId) {
		throw createError(400, "You must belong to a company to view activity");
	}

	const now = new Date();
	const start = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth() - (ACTIVITY_MONTHS - 1),
			1,
		),
	);
	const inCompany = { assessment: { companyId } };

	const [invitations, attempts, results] = await Promise.all([
		prisma.invitation.findMany({
			where: { ...inCompany, createdAt: { gte: start } },
			select: { createdAt: true },
		}),
		prisma.attempt.findMany({
			where: { ...inCompany, status: "SUBMITTED" },
			select: {
				startedAt: true,
				updatedAt: true,
				totalScore: true,
				assessment: { select: { passingScore: true } },
			},
		}),
		prisma.submissionResult.findMany({
			where: {
				status: { not: "PENDING_REVIEW" },
				maxScore: { gt: 0 },
				submission: { attempt: inCompany },
			},
			select: {
				score: true,
				maxScore: true,
				submission: { select: { problem: { select: { type: true } } } },
			},
		}),
	]);

	// One bucket per month, zero filled, so quiet months still show
	const months = new Map<
		string,
		{ month: string; invitations: number; submissions: number }
	>();
	for (let i = 0; i < ACTIVITY_MONTHS; i++) {
		const key = monthKey(
			new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)),
		);
		months.set(key, { month: key, invitations: 0, submissions: 0 });
	}
	for (const row of invitations) {
		const point = months.get(monthKey(row.createdAt));
		if (point) point.invitations += 1;
	}

	const outcomes = { passed: 0, failed: 0, awaitingReview: 0 };
	for (const attempt of attempts) {
		// Expired attempts are finalized lazily, so updatedAt can be much later
		// than when the candidate sat the test. startedAt is the honest month.
		const point = months.get(monthKey(attempt.startedAt ?? attempt.updatedAt));
		if (point) point.submissions += 1;
		if (attempt.totalScore === null) outcomes.awaitingReview += 1;
		else if (attempt.totalScore >= attempt.assessment.passingScore)
			outcomes.passed += 1;
		else outcomes.failed += 1;
	}

	const byType = (["CODING", "MCQ", "WRITTEN"] as const).map((type) => {
		const ofType = results.filter((r) => r.submission.problem.type === type);
		const share = ofType.reduce((sum, r) => sum + r.score / r.maxScore, 0);
		return {
			type,
			graded: ofType.length,
			averagePercent: ofType.length
				? Math.round((share / ofType.length) * 100)
				: null,
		};
	});

	return { months: [...months.values()], outcomes, byType };
};

export const companyService = {
	getCompanyActivity,
	createCompany,
	getMyCompany,
	updateCompany,
	getCredits,
	inviteTeamMember,
	acceptTeamInvitation,
};
