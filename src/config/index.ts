import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
	node_env: process.env.NODE_ENV || "development",
	port: process.env.PORT || 5000,
	database_url: process.env.DATABASE_URL,
	app_url: process.env.APP_URL,
	bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
	jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
	jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
	jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
	jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
	stripe_secret_key: process.env.STRIPE_SECRET_KEY!,
	stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET!,
	google_client_id: process.env.GOOGLE_CLIENT_ID!,
	google_client_secret: process.env.GOOGLE_CLIENT_SECRET!,
	better_auth_secret: process.env.BETTER_AUTH_SECRET!,
	better_auth_url: process.env.BETTER_AUTH_URL!,
	upstash_redis_rest_url: process.env.UPSTASH_REDIS_REST_URL!,
	upstash_redis_rest_token: process.env.UPSTASH_REDIS_REST_TOKEN!,
	smtp_host: process.env.SMTP_HOST!,
	smtp_port: Number(process.env.SMTP_PORT) || 587,
	smtp_user: process.env.SMTP_USER!,
	smtp_pass: process.env.SMTP_PASS!,
	mail_from: process.env.MAIL_FROM!,
	cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
	cloudinary_api_key: process.env.CLOUDINARY_API_KEY!,
	cloudinary_api_secret: process.env.CLOUDINARY_API_SECRET!,
	team_invitation_expires_in_days:
		Number(process.env.TEAM_INVITATION_EXPIRES_IN_DAYS) || 7,
	candidate_invitation_expires_in_days:
		Number(process.env.CANDIDATE_INVITATION_EXPIRES_IN_DAYS) || 7,
	// Seed credentials
	admin_email: process.env.ADMIN_EMAIL,
	admin_password: process.env.ADMIN_PASSWORD,
	admin_name: process.env.ADMIN_NAME,
	company_owner_email: process.env.COMPANY_OWNER_EMAIL,
	company_owner_password: process.env.COMPANY_OWNER_PASSWORD,
	company_owner_name: process.env.COMPANY_OWNER_NAME,
	company_name: process.env.COMPANY_NAME,
	candidate_email: process.env.CANDIDATE_EMAIL,
	candidate_password: process.env.CANDIDATE_PASSWORD,
	candidate_name: process.env.CANDIDATE_NAME,
	assessment_creator_email: process.env.ASSESSMENT_CREATOR_EMAIL,
	assessment_creator_password: process.env.ASSESSMENT_CREATOR_PASSWORD,
	assessment_creator_name: process.env.ASSESSMENT_CREATOR_NAME,
	evaluator_email: process.env.EVALUATOR_EMAIL,
	evaluator_password: process.env.EVALUATOR_PASSWORD,
	evaluator_name: process.env.EVALUATOR_NAME,
};
