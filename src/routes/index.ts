import { Router } from "express";
import { assessmentRoutes } from "../modules/assessment/assessment.route";
import { authRoutes } from "../modules/auth/auth.route";
import { companyRoutes } from "../modules/company/company.route";
import { invitationRoutes } from "../modules/invitation/invitation.route";
import { problemRoutes } from "../modules/problem/problem.route";
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
];

for (const route of moduleRoutes) {
	router.use(route.path, route.route);
}

export const rootRouter = router;
