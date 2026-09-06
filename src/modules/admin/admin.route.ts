import { Router } from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { adminController } from "./admin.controller";
import { adminValidation } from "./admin.validation";

const router = Router();

router.use(auth("ADMIN")); // every route below requires ADMIN

router.get("/companies", adminController.listCompanies);
router.patch("/companies/:id/suspend", adminController.suspendCompany);
router.get("/candidates", adminController.listCandidates);
router.patch("/candidates/:id/suspend", adminController.suspendCandidate);
router.get("/audit-logs", adminController.getAuditLogs);
router.get("/stats", adminController.getPlatformStats);
router.post(
	"/credits/adjust",
	validateRequest(adminValidation.creditAdjustValidationSchema),
	adminController.adjustCredits,
);

export const adminRoutes = router;
