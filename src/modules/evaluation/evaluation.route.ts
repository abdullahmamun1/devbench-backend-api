import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { evaluationController } from "./evaluation.controller";
import { evaluationValidation } from "./evaluation.validation";

const router = Router();

router.get(
	"/pending",
	auth(
		UserRole.ADMIN,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.COMPANY_OWNER,
		UserRole.EVALUATOR,
	),
	evaluationController.getPendingSubmissions,
);

router.get(
	"/:id",
	auth(
		UserRole.ADMIN,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.COMPANY_OWNER,
		UserRole.EVALUATOR,
	),
	evaluationController.getSubmissionDetail,
);

router.patch(
	"/:id",
	auth(
		UserRole.ADMIN,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.COMPANY_OWNER,
		UserRole.EVALUATOR,
	),
	validateRequest(evaluationValidation.gradeSubmissionValidationSchema),
	evaluationController.gradeSubmission,
);

export const evaluationRoutes = router;
