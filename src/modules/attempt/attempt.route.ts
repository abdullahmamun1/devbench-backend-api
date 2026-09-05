import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { attemptController } from "./attempt.controller";
import { attemptValidation } from "./attempt.validation";

const router = Router();

router.get("/:id", auth(UserRole.CANDIDATE), attemptController.getAttemptById);

router.post(
	"/:id/submissions",
	auth(UserRole.CANDIDATE),
	validateRequest(attemptValidation.submitAnswerValidationSchema),
	attemptController.upsertSubmission,
);

export const attemptRoutes = router;
