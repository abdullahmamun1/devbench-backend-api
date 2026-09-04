import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.route";
import { companyRoutes } from "../modules/company/company.route";
import { problemRoutes } from "../modules/problem/problem.route";
import { userRoutes } from "../modules/user/user.route";
import { assessmentRoutes } from "../modules/assessment/assessment.route";

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
];

for (const route of moduleRoutes) {
	router.use(route.path, route.route);
}

export const rootRouter = router;
