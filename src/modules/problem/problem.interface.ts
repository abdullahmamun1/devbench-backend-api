import type { ProblemType, UserRole } from "../../../generated/prisma";

export interface ICreateTestCase {
	input: string;
	expectedOutput: string;
	isHidden?: boolean;
	weight?: number;
}

export interface ICreateMcqOption {
	text: string;
	isCorrect: boolean;
	order: number;
}

export interface ICreateProblemPayload {
	title: string;
	description: string;
	type: ProblemType;
	points: number;
	companyId?: string;
	testCases?: ICreateTestCase[];
	mcqOptions?: ICreateMcqOption[];
}

export interface IUpdateProblemPayload {
	title?: string;
	description?: string;
	points?: number;
	testCases?: ICreateTestCase[];
	mcqOptions?: ICreateMcqOption[];
}

export interface IProblemFilterQuery {
	type?: ProblemType;
	search?: string;
	page?: string | number;
	limit?: string | number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface ICallerInfo {
	role: UserRole;
	companyId?: string | null;
}
