import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth, optionalAuth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { invitationController } from "./invitation.controller";
import { invitationValidation } from "./invitation.validation";

const router = Router();

router.get(
	"/me",
	auth(UserRole.CANDIDATE),
	invitationController.getMyInvitations,
);

router.get("/accept/:token", invitationController.getInvitationPreview);

router.post(
	"/accept/:token",
	optionalAuth(),
	validateRequest(invitationValidation.acceptInvitationValidationSchema),
	invitationController.acceptInvitation,
);

export const invitationRoutes = router;
