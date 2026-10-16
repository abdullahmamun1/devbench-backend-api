import { Router } from "express";
import { adminRoutes } from "../modules/admin/admin.route";
import { assessmentRoutes } from "../modules/assessment/assessment.route";
import { attemptRoutes } from "../modules/attempt/attempt.route";
import { authRoutes } from "../modules/auth/auth.route";
import { companyRoutes } from "../modules/company/company.route";
import { contactRoutes } from "../modules/contact/contact.route";
import { evaluationRoutes } from "../modules/evaluation/evaluation.route";
import { insightsRoutes } from "../modules/insights/insights.route";
import { invitationRoutes } from "../modules/invitation/invitation.route";
import { paymentRoutes } from "../modules/payment/payment.route";
import { problemRoutes } from "../modules/problem/problem.route";
import { publicRoutes } from "../modules/public/public.route";
import { userRoutes } from "../modules/user/user.route";

const router = Router();

const moduleRoutes = [
	{
		path: "/auth",
		route: authRoutes,
	},
	{
		path: "/users",
		route: userRoutes,
	},
	{
		path: "/problems",
		route: problemRoutes,
	},
	{
		path: "/companies",
		route: companyRoutes,
	},
	{
		path: "/assessments",
		route: assessmentRoutes,
	},
	{
		path: "/invitations",
		route: invitationRoutes,
	},
	{
		path: "/attempts",
		route: attemptRoutes,
	},
	{
		path: "/evaluations",
		route: evaluationRoutes,
	},
	{
		path: "/payments",
		route: paymentRoutes,
	},
	{
		path: "/admin",
		route: adminRoutes,
	},
	{
		path: "/contact",
		route: contactRoutes,
	},
	{
		path: "/insights",
		route: insightsRoutes,
	},
	{
		path: "/public",
		route: publicRoutes,
	},
];

for (const route of moduleRoutes) {
	router.use(route.path, route.route);
}

export const rootRouter = router;
