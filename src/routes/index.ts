import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.route";
import { problemRoutes } from "../modules/problem/problem.route";
import { userRoutes } from "../modules/user/user.route";
import { companyRoutes } from "../modules/company/company.route";

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
];

for (const route of moduleRoutes) {
	router.use(route.path, route.route);
}

export const rootRouter = router;
