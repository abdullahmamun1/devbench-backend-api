import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rateLimiter";
import { insightsController } from "./insights.controller";

const router = Router();

const COMPANY_ROLES = [
	UserRole.ADMIN,
	UserRole.COMPANY_OWNER,
	UserRole.ASSESSMENT_CREATOR,
	UserRole.EVALUATOR,
];

router.get(
	"/attempts/:id/signals",
	auth(...COMPANY_ROLES),
	insightsController.getAttemptSignals,
);

router.get(
	"/attempts/:id",
	auth(...COMPANY_ROLES),
	insightsController.getAttemptInsights,
);

router.get(
	"/submissions/:id/similarity",
	auth(...COMPANY_ROLES),
	rateLimiter(),
	insightsController.getSubmissionSimilarity,
);

router.get(
	"/assessments/:id",
	auth(...COMPANY_ROLES),
	insightsController.getAssessmentInsights,
);

export const insightsRoutes = router;
