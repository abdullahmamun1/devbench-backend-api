import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { attemptController } from "../attempt/attempt.controller";
import { invitationController } from "../invitation/invitation.controller";
import { invitationValidation } from "../invitation/invitation.validation";
import { assessmentController } from "./assessment.controller";
import { assessmentValidation } from "./assessment.validation";

const router = Router();

router.post(
	"/",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	validateRequest(assessmentValidation.createAssessmentValidationSchema),
	assessmentController.createAssessment,
);

router.get(
	"/",
	auth(
		UserRole.ADMIN,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.COMPANY_OWNER,
		UserRole.EVALUATOR,
	),
	assessmentController.getAllAssessments,
);
router.get(
	"/:id",
	auth(
		UserRole.ADMIN,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.COMPANY_OWNER,
		UserRole.EVALUATOR,
	),
	assessmentController.getAssessmentById,
);

router.patch(
	"/:id",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	validateRequest(assessmentValidation.updateAssessmentValidationSchema),
	assessmentController.updateAssessment,
);

router.delete(
	"/:id",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	assessmentController.deleteAssessment,
);

router.post(
	"/:id/problems",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	validateRequest(assessmentValidation.attachProblemValidationSchema),
	assessmentController.attachProblem,
);

router.delete(
	"/:id/problems/:problemId",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	assessmentController.detachProblem,
);

router.post(
	"/:id/publish",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	assessmentController.publishAssessment,
);

router.post(
	"/:id/close",
	auth(UserRole.ADMIN, UserRole.COMPANY_OWNER, UserRole.ASSESSMENT_CREATOR),
	assessmentController.closeAssessment,
);

router.post(
	"/:id/invitations",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	validateRequest(invitationValidation.createInvitationValidationSchema),
	invitationController.createInvitation,
);

router.post(
	"/:id/invitations/:invitationId/resend",
	rateLimiter("auth"),
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	invitationController.resendInvitation,
);

router.get(
	"/:id/invitations",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	invitationController.getAllInvitations,
);

router.get(
	"/:id/results",
	auth(
		UserRole.ADMIN,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.COMPANY_OWNER,
		UserRole.EVALUATOR,
	),
	assessmentController.getAssessmentResults,
);

router.post(
	"/:id/attempts/start",
	auth(UserRole.CANDIDATE),
	attemptController.startAttempt,
);

export const assessmentRoutes = router;
