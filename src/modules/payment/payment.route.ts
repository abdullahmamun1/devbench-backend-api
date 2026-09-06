import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { paymentController } from "./payment.controller";
import { paymentValidation } from "./payment.validation";

const router = Router();

router.post(
	"/create-session",
	auth(UserRole.COMPANY_OWNER),
	validateRequest(paymentValidation.createSessionValidationSchema),
	paymentController.createCheckoutSession,
);

router.post("/webhook", paymentController.handleWebhook);

router.get(
	"/history",
	auth(UserRole.COMPANY_OWNER),
	paymentController.getPaymentHistory,
);

export const paymentRoutes = router;
