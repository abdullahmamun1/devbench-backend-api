export interface ICreateSessionPayload {
	credits: number;
}

export interface ICallerInfo {
	userId: string;
	role: string;
	companyId?: string | null;
	email: string;
}

export interface IPaymentFilterQuery {
	status?: string;
	page?: string | number;
	limit?: string | number;
}
