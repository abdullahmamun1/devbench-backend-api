import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { adminController } from "./admin.controller";
import { adminValidation } from "./admin.validation";

const router = Router();

router.get("/companies", auth(UserRole.ADMIN), adminController.listCompanies);
router.patch(
	"/companies/:id/suspend",
	auth(UserRole.ADMIN),
	adminController.suspendCompany,
);
router.get("/candidates", auth(UserRole.ADMIN), adminController.listCandidates);
router.patch(
	"/users/:id/suspend",
	auth(UserRole.ADMIN),
	adminController.suspendUser,
);
router.delete("/users/:id", auth(UserRole.ADMIN), adminController.deleteUser);
router.get("/audit-logs", auth(UserRole.ADMIN), adminController.getAuditLogs);
router.get("/stats", auth(UserRole.ADMIN), adminController.getPlatformStats);
router.post(
	"/credits/adjust",
	auth(UserRole.ADMIN),
	validateRequest(adminValidation.creditAdjustValidationSchema),
	adminController.adjustCredits,
);

export const adminRoutes = router;
