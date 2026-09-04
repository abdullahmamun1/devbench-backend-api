import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
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
	validateRequest(assessmentValidation.createAssessmentValidationSchema),
	assessmentController.detachProblem,
);

router.post(
	"/:id/publish",
	auth(UserRole.ADMIN, UserRole.ASSESSMENT_CREATOR, UserRole.COMPANY_OWNER),
	assessmentController.publishAssessment,
);

export const assessmentRoutes = router;
