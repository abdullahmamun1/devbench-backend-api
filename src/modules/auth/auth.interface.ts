export interface IRegisterPayload {
	name: string;
	email: string;
	password: string;
	role: "CANDIDATE" | "COMPANY_OWNER";
	companyName?: string;
}

export interface ILoginPayload {
	email: string;
	password: string;
}
