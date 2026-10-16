import type { UserRole } from "../../../generated/prisma";

export interface IGradeSubmissionPayload {
	score: number;
	status: "PASSED" | "FAILED" | "PARTIAL";
	feedback?: string;
}

export interface IEvaluationFilterQuery {
	type?: string;
	// Matches the candidate's name or email, or the assessment title
	search?: string;
	page?: string | number;
	limit?: string | number;
}

export interface ICallerInfo {
	userId: string;
	role: UserRole;
	companyId?: string | null;
}
