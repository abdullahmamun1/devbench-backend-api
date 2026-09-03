import type { UserRole } from "../../../generated/prisma";

export interface ICreateCompanyPayload {
	companyName: string;
}

export interface IInviteTeamMemberPayload {
	email: string;
	role: Extract<UserRole, "ASSESSMENT_CREATOR" | "EVALUATOR">;
}

export interface ICallerInfo {
	userId: string;
	role: UserRole;
	companyId?: string | null;
}

export interface IUpdateCompanyPayload {
	companyName?: string;
}
