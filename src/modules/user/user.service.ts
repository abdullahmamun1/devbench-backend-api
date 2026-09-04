import { prisma } from "../../lib/prisma";
import { createError } from "../../utils/createError";
import type { IUpdateProfilePayload } from "./user.interface";

const getMyProfile = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			companyId: true,
			provider: true,
			status: true,
			createdAt: true,
			updatedAt: true,
			candidateProfile: true,
			emailVerified: true,
			company: {
				select: {
					id: true,
					companyName: true,
					creditBalance: true,
				},
			},
		},
	});

	if (!user) {
		throw createError(404, "User not found");
	}

	return user;
};

const updateMyProfile = async (
	userId: string,
	payload: IUpdateProfilePayload,
) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: { candidateProfile: true },
	});

	if (!user) {
		throw createError(404, "User not found");
	}

	const { name, headline, resumeUrl, skills } = payload;

	return await prisma.$transaction(async (tx) => {
		if (name) {
			await tx.user.update({
				where: { id: userId },
				data: { name },
			});
		}

		if (
			headline !== undefined ||
			resumeUrl !== undefined ||
			skills !== undefined
		) {
			if (user.role === "CANDIDATE") {
				await tx.candidateProfile.upsert({
					where: { userId },
					update: {
						...(headline !== undefined && { headline }),
						...(resumeUrl !== undefined && { resumeUrl }),
						...(skills !== undefined && { skills }),
					},
					create: {
						userId,
						headline: headline || null,
						resumeUrl: resumeUrl || null,
						skills: skills || [],
					},
				});
			}
		}

		return await tx.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				companyId: true,
				status: true,
				provider: true,
				createdAt: true,
				updatedAt: true,
				candidateProfile: true,
				company: true,
			},
		});
	});
};

export const userService = {
	getMyProfile,
	updateMyProfile,
};
