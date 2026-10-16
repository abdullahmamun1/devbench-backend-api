import type { UserRole } from "../../../generated/prisma";

export interface ICreateInvitationPayload {
	candidateEmail: string;
}

export interface IAcceptInvitationPayload {
	name?: string;
	password?: string;
}

export interface IInvitationFilterQuery {
	status?: "PENDING" | "ACCEPTED" | "EXPIRED";
	// Matches the candidate's email, case-insensitive
	search?: string;
	page?: string | number;
	limit?: string | number;
}

export interface ICallerInfo {
	userId: string;
	role: UserRole;
	companyId?: string | null;
}
