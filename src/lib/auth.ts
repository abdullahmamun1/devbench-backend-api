import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import config from "../config/index.js";
import { prisma } from "./prisma.js";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	baseURL: config.better_auth_url,
	secret: config.better_auth_secret,
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	socialProviders: {
		google: {
			clientId: config.google_client_id,
			clientSecret: config.google_client_secret,
		},
	},
	user: {
		additionalFields: {
			role: { type: "string", required: true, defaultValue: "CANDIDATE" },
			companyId: { type: "string", required: false },
			status: { type: "string", required: true, defaultValue: "ACTIVE" },
		},
	},
});

export const { handler } = auth;
