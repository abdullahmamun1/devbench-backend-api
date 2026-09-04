import { UserRole } from "../../../generated/prisma";

export interface ICreateAssessmentPayload {
	title: string;
	description?: string;
	durationMinutes: number;
	passingScore: number;
}

export interface IUpdateAssessmentPayload {
	title?: string;
	description?: string;
	durationMinutes?: number;
	passingScore?: number;
}

export interface IAttachProblemPayload {
	problemId: string;
	order: number;
	points: number;
}

export interface IAssessmentFilterQuery {
	status?: "DRAFT" | "PUBLISHED" | "CLOSED";
	page?: string | number;
	limit?: string | number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface ICallerInfo {
	role: UserRole;
	companyId?: string | null;
}
