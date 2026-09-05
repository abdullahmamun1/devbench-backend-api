import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { problemController } from "./problem.controller";
import { problemValidation } from "./problem.validation";

const router = Router();

router.post(
	"/",
	auth(UserRole.ADMIN, UserRole.COMPANY_OWNER, UserRole.ASSESSMENT_CREATOR),
	validateRequest(problemValidation.createProblemValidationSchema),
	problemController.createProblem,
);

router.get(
	"/",
	auth(
		UserRole.ADMIN,
		UserRole.COMPANY_OWNER,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.EVALUATOR,
	),
	problemController.getAllProblems,
);

router.get(
	"/:id",
	auth(
		UserRole.ADMIN,
		UserRole.COMPANY_OWNER,
		UserRole.ASSESSMENT_CREATOR,
		UserRole.EVALUATOR,
	),
	problemController.getProblemById,
);

router.patch(
	"/:id",
	auth(UserRole.ADMIN, UserRole.COMPANY_OWNER, UserRole.ASSESSMENT_CREATOR),
	validateRequest(problemValidation.updateProblemValidationSchema),
	problemController.updateProblem,
);

router.delete(
	"/:id",
	auth(UserRole.ADMIN, UserRole.COMPANY_OWNER, UserRole.ASSESSMENT_CREATOR),
	problemController.deleteProblem,
);

export const problemRoutes = router;
