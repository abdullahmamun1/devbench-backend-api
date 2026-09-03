import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { createError } from "../../utils/createError";
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

		return company;
	});
};

const getMyCompany = async (caller: ICallerInfo) => {
	if (!caller.companyId) {
		throw createError(400, "You do not belong to a company");
	}

	const company = await prisma.company.findFirst({
		where: { id: caller.companyId, deletedAt: null },
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
	if (!caller.companyId) {
		throw createError(400, "You do not belong to a company");
	}

	const company = await prisma.company.findFirst({
		where: { id: caller.companyId, deletedAt: null },
	});

	if (!company) {
		throw createError(404, "Company not found");
	}

	const updated = await prisma.company.update({
		where: { id: caller.companyId },
		data: {
			...(payload.companyName && { companyName: payload.companyName }),
		},
	});

	return updated;
};

const getCredits = async (caller: ICallerInfo) => {
	if (!caller.companyId) {
		throw createError(400, "You do not belong to a company");
	}

	const company = await prisma.company.findFirst({
		where: { id: caller.companyId, deletedAt: null },
		select: {
			id: true,
			creditBalance: true,
		},
	});

	if (!company) {
		throw createError(404, "Company not found");
	}

	const transactions = await prisma.creditTransaction.findMany({
		where: { companyId: caller.companyId },
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
	if (!caller.companyId) {
		throw createError(400, "You do not belong to a company");
	}

	const existingUser = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	if (existingUser?.companyId) {
		throw createError(400, "This user already belongs to a company");
	}

	const pendingInvite = await prisma.teamInvitation.findFirst({
		where: {
			companyId: caller.companyId,
			email: payload.email,
			status: "PENDING",
		},
	});

	if (pendingInvite) {
		throw createError(400, "This email already has a pending invitation");
	}

	const token = crypto.randomBytes(32).toString("hex");
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + config.invitation_expires_in_days);

	const invitation = await prisma.teamInvitation.create({
		data: {
			companyId: caller.companyId,
			email: payload.email,
			role: payload.role,
			token,
			expiresAt,
		},
	});

	const inviteLink = `${config.app_url}/team/accept/${token}`;

	await transporter.sendMail({
		from: config.mail_from,
		to: payload.email,
		subject: "You've been invited to join a team on DevBench",
		html: `<p>You've been invited as a <b>${payload.role}</b>. Click <a href="${inviteLink}">here</a> to accept. This link expires in ${config.invitation_expires_in_days} days.</p>`,
	});

	return invitation;
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
			if (!registerPayload) {
				throw createError(
					400,
					"Name and password are required to accept this invitation",
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

		return tx.user.findUnique({ where: { id: targetUserId } });
	});
};

export const companyService = {
	createCompany,
	getMyCompany,
	updateCompany,
	getCredits,
	inviteTeamMember,
	acceptTeamInvitation,
};
