import { Router } from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { problemController } from "./problem.controller";
import { problemValidation } from "./problem.validation";

const router = Router();

router.post(
	"/",
	auth("ADMIN", "ASSESSMENT_CREATOR"),
	validateRequest(problemValidation.createProblemValidationSchema),
	problemController.createProblem,
);

router.get("/", auth(), problemController.getAllProblems);

router.get("/:id", auth(), problemController.getProblemById);

router.patch(
	"/:id",
	auth("ADMIN", "ASSESSMENT_CREATOR"),
	validateRequest(problemValidation.updateProblemValidationSchema),
	problemController.updateProblem,
);

router.delete(
	"/:id",
	auth("ADMIN", "ASSESSMENT_CREATOR"),
	problemController.deleteProblem,
);

export const problemRoutes = router;
