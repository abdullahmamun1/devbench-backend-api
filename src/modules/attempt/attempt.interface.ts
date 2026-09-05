import type { UserRole } from "../../../generated/prisma";

export interface ISubmitAnswerPayload {
	problemId: string;
	selectedOptionId?: string;
	answerText?: string;
	code?: string;
	language?: string;
}

export interface ICallerInfo {
	userId: string;
	role: UserRole;
	companyId?: string | null;
}
