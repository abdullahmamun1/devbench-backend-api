import { Router } from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { problemController } from "./problem.controller";
import { problemValidation } from "./problem.validation";

const router = Router();

router.post(
	"/",
	auth("ADMIN", "COMPANY_OWNER", "ASSESSMENT_CREATOR"),
	validateRequest(problemValidation.createProblemValidationSchema),
	problemController.createProblem,
);

router.get(
	"/",
	auth("ADMIN", "COMPANY_OWNER", "ASSESSMENT_CREATOR", "EVALUATOR"),
	problemController.getAllProblems,
);

router.get(
	"/:id",
	auth("ADMIN", "COMPANY_OWNER", "ASSESSMENT_CREATOR", "EVALUATOR"),
	problemController.getProblemById,
);

router.patch(
	"/:id",
	auth("ADMIN", "COMPANY_OWNER", "ASSESSMENT_CREATOR"),
	validateRequest(problemValidation.updateProblemValidationSchema),
	problemController.updateProblem,
);

router.delete(
	"/:id",
	auth("ADMIN", "COMPANY_OWNER", "ASSESSMENT_CREATOR"),
	problemController.deleteProblem,
);

export const problemRoutes = router;
