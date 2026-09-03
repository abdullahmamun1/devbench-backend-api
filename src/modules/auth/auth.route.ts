import { Router } from "express";
import { rateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { authController } from "./auth.controller";
import { authValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	rateLimiter("auth"),
	validateRequest(authValidation.registerValidationSchema),
	authController.register,
);

router.post(
	"/login",
	rateLimiter("auth"),
	validateRequest(authValidation.loginValidationSchema),
	authController.login,
);

router.post(
	"/refresh-token",
	validateRequest(authValidation.refreshTokenValidationSchema),
	authController.refreshToken,
);

router.post("/logout", authController.logout);

export const authRoutes = router;
