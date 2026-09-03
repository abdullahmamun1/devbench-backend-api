import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.route";
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
];

for (const route of moduleRoutes) {
	router.use(route.path, route.route);
}

export const rootRouter = router;
