import type { UserRole } from "../../../generated/prisma";

export interface IGradeSubmissionPayload {
	score: number;
	status: "PASSED" | "FAILED" | "PARTIAL";
	feedback?: string;
}

export interface IEvaluationFilterQuery {
	page?: string | number;
	limit?: string | number;
}

export interface ICallerInfo {
	userId: string;
	role: UserRole;
	companyId?: string | null;
}
