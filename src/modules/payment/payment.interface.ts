export interface ICreateSessionPayload {
	credits: number;
}

export interface ICallerInfo {
	userId: string;
	role: string;
	companyId?: string | null;
}

export interface IPaymentFilterQuery {
	page?: string | number;
	limit?: string | number;
}
