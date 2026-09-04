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
	"/verify-email",
	validateRequest(authValidation.EmailVerificationZodSchema),
	authController.verifyEmail,
);

router.post(
	"/login",
	rateLimiter("auth"),
	validateRequest(authValidation.loginValidationSchema),
	authController.login,
);

router.post("/google", authController.googleLogin);

router.post(
	"/refresh-token",
	validateRequest(authValidation.refreshTokenValidationSchema),
	authController.refreshToken,
);

router.post(
	"/forgot-password",
	rateLimiter("auth"),
	validateRequest(authValidation.forgotPasswordValidationSchema),
	authController.forgotPassword,
);

router.post(
	"/reset-password",
	rateLimiter("auth"),
	validateRequest(authValidation.resetPasswordValidationSchema),
	authController.resetPassword,
);

router.post("/logout", authController.logout);

export const authRoutes = router;
