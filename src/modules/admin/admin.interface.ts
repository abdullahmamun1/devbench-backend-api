import type { UserRole } from "../../../generated/prisma";

export interface IListQuery {
	page?: string | number;
	limit?: string | number;
	search?: string;
}

export interface IAuditLogFilterQuery {
	page?: string | number;
	limit?: string | number;
	entityType?: string;
	entityId?: string;
}

export interface ICreditAdjustPayload {
	companyId: string;
	amount: number; // positive to add, negative to deduct
	reason: string;
}

export interface ICallerInfo {
	userId: string;
	role: UserRole;
}
