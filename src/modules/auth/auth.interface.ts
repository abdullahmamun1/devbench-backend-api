export interface IRegisterPayload {
	name: string;
	email: string;
	password: string;
	role: "CANDIDATE" | "COMPANY_OWNER";
	companyName?: string;
}

export interface IVerifyEmailPayload {
	email: string;
	otp: string;
}

export interface ILoginPayload {
	email: string;
	password: string;
}

export interface IGoogleLoginPayload {
	idToken: string;
	role?: "CANDIDATE" | "COMPANY_OWNER";
	companyName?: string;
}

export interface IForgotPasswordPayload {
	email: string;
}

export interface IResetPasswordPayload {
	email: string;
	otp: string;
	newPassword: string;
}
