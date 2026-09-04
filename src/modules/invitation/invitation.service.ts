import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "../../../generated/prisma";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { createError } from "../../utils/createError";
import { resolveCompanyScope } from "../../utils/scoping";
import type {
	IAcceptInvitationPayload,
	ICallerInfo,
	ICreateInvitationPayload,
	IInvitationFilterQuery,
} from "./invitation.interface";

const createInvitation = async (
	assessmentId: string,
	payload: ICreateInvitationPayload,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);

	const { invitation, assessmentTitle, candidateEmail } =
		await prisma.$transaction(async (tx) => {
			const assessment = await tx.assessment.findFirst({
				where: {
					id: assessmentId,
					deletedAt: null,
					...(scopeCompanyId && { companyId: scopeCompanyId }),
				},
			});

			if (!assessment) {
				throw createError(404, "Assessment not found");
			}

			if (assessment.status !== "PUBLISHED") {
				throw createError(
					400,
					"Only published assessments can receive invitations",
				);
			}

			const existingInvitation = await tx.invitation.findFirst({
				where: {
					assessmentId,
					candidateEmail: payload.candidateEmail,
				},
			});

			if (existingInvitation) {
				throw createError(
					400,
					"This candidate has already been invited to this assessment",
				);
			}

			// Atomic, race-safe debit: a single UPDATE ... WHERE creditBalance > 0 is
			// row-locked by Postgres, so two concurrent requests can't both spend the
			// same last credit. If the guard clause fails to match, count is 0.
			const debit = await tx.company.updateMany({
				where: {
					id: assessment.companyId,
					creditBalance: { gt: 0 },
				},
				data: {
					creditBalance: { decrement: 1 },
				},
			});

			if (debit.count === 0) {
				throw createError(
					400,
					"Insufficient credit balance to send this invitation",
				);
			}

			const company = await tx.company.findUniqueOrThrow({
				where: { id: assessment.companyId },
			});

			const token = crypto.randomBytes(32).toString("hex");
			const expiresAt = new Date();
			expiresAt.setDate(
				expiresAt.getDate() + config.candidate_invitation_expires_in_days,
			);

			const createdInvitation = await tx.invitation.create({
				data: {
					assessmentId,
					candidateEmail: payload.candidateEmail,
					token,
					expiresAt,
				},
			});

			await tx.creditTransaction.create({
				data: {
					companyId: assessment.companyId,
					type: "DEDUCTION",
					amount: 1,
					balanceAfter: company.creditBalance,
					referenceId: createdInvitation.id,
				},
			});

			return {
				invitation: createdInvitation,
				assessmentTitle: assessment.title,
				candidateEmail: payload.candidateEmail,
			};
		});

	// Email sent after the transaction commits — a slow/failed email shouldn't
	// hold the DB transaction open or roll back a successful credit debit.
	const acceptLink = `${config.app_url}/invitations/accept/${invitation.token}`;

	await transporter.sendMail({
		from: config.mail_from,
		to: candidateEmail,
		subject: `You've been invited to take an assessment: ${assessmentTitle}`,
		html: `<p>You've been invited to take the assessment "<b>${assessmentTitle}</b>". Click <a href="${acceptLink}">here</a> to get started. This invitation expires in ${config.candidate_invitation_expires_in_days} days.</p>`,
	});

	return invitation;
};

const getAllInvitations = async (
	assessmentId: string,
	query: IInvitationFilterQuery,
	caller: ICallerInfo,
) => {
	const scopeCompanyId = resolveCompanyScope(caller);
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;

	// Confirm the assessment exists and belongs to the caller's company before listing.
	const assessment = await prisma.assessment.findFirst({
		where: {
			id: assessmentId,
			deletedAt: null,
			...(scopeCompanyId && { companyId: scopeCompanyId }),
		},
	});

	if (!assessment) {
		throw createError(404, "Assessment not found");
	}

	const where: Prisma.InvitationWhereInput = {
		assessmentId,
		...(query.status && { status: query.status }),
	};

	const [total, data] = await Promise.all([
		prisma.invitation.count({ where }),
		prisma.invitation.findMany({
			where,
			skip,
			take: limit,
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				candidateEmail: true,
				status: true,
				expiresAt: true,
				createdAt: true,
			},
		}),
	]);

	return {
		meta: { page, limit, total },
		data,
	};
};

const getInvitationPreview = async (token: string) => {
	const invitation = await prisma.invitation.findUnique({
		where: { token },
		include: {
			assessment: {
				select: {
					id: true,
					title: true,
					description: true,
					durationMinutes: true,
					passingScore: true,
					company: {
						select: { companyName: true },
					},
				},
			},
		},
	});

	if (!invitation) {
		throw createError(404, "Invitation not found");
	}

	if (invitation.status !== "PENDING") {
		throw createError(400, "This invitation is no longer valid");
	}

	if (invitation.expiresAt < new Date()) {
		throw createError(410, "This invitation has expired");
	}

	return {
		assessment: invitation.assessment,
		expiresAt: invitation.expiresAt,
	};
};

const acceptInvitation = async (
	token: string,
	userId: string | undefined,
	registerPayload?: IAcceptInvitationPayload,
) => {
	const invitation = await prisma.invitation.findUnique({ where: { token } });

	if (!invitation) {
		throw createError(404, "Invitation not found");
	}

	if (invitation.status !== "PENDING") {
		throw createError(400, "This invitation is no longer valid");
	}

	if (invitation.expiresAt < new Date()) {
		await prisma.invitation.update({
			where: { id: invitation.id },
			data: { status: "EXPIRED" },
		});
		throw createError(410, "This invitation has expired");
	}

	return await prisma.$transaction(async (tx) => {
		let candidateId = userId;

		if (candidateId) {
			// Existing, already-logged-in user is accepting.
			const existingUser = await tx.user.findUnique({
				where: { id: candidateId },
			});

			if (!existingUser) {
				throw createError(404, "User not found");
			}

			if (existingUser.email !== invitation.candidateEmail) {
				throw createError(403, "This invitation was sent to a different email");
			}

			if (existingUser.role !== "CANDIDATE") {
				throw createError(
					403,
					"Only candidate accounts can accept assessment invitations",
				);
			}
		} else {
			// No authenticated user — register-on-accept.
			if (!registerPayload?.name || !registerPayload?.password) {
				throw createError(
					400,
					"Name and password are required to accept this invitation",
				);
			}

			const existingByEmail = await tx.user.findUnique({
				where: { email: invitation.candidateEmail },
			});

			if (existingByEmail) {
				throw createError(
					400,
					"An account already exists for this email — please log in to accept this invitation",
				);
			}

			const passwordHash = await bcrypt.hash(
				registerPayload.password,
				Number(config.bcrypt_salt_rounds) || 12,
			);

			const newUser = await tx.user.create({
				data: {
					name: registerPayload.name,
					email: invitation.candidateEmail,
					passwordHash,
					role: "CANDIDATE",
					emailVerified: true,
				},
			});

			candidateId = newUser.id;
		}

		await tx.invitation.update({
			where: { id: invitation.id },
			data: { status: "ACCEPTED", candidateId },
		});

		return tx.user.findUnique({
			where: { id: candidateId },
			select: { id: true, name: true, email: true, role: true },
		});
	});
};

export const invitationService = {
	createInvitation,
	getAllInvitations,
	getInvitationPreview,
	acceptInvitation,
};
