import { Router } from "express";
import { rateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { contactController } from "./contact.controller";
import { contactValidation } from "./contact.validation";

const router = Router();

router.post(
	"/",
	rateLimiter("contact"),
	validateRequest(contactValidation.sendContactMessageValidationSchema),
	contactController.sendContactMessage,
);

export const contactRoutes = router;
