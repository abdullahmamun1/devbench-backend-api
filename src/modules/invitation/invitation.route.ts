import { Router } from "express";
import { optionalAuth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { invitationController } from "./invitation.controller";
import { invitationValidation } from "./invitation.validation";

const router = Router();

router.get("/accept/:token", invitationController.getInvitationPreview);

router.post(
	"/accept/:token",
	optionalAuth(),
	validateRequest(invitationValidation.acceptInvitationValidationSchema),
	invitationController.acceptInvitation,
);

export const invitationRoutes = router;
