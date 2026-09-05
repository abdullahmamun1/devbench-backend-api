import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth, optionalAuth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { companyController } from "./company.controller";
import { companyValidation } from "./company.validation";

const router = Router();

router.post(
	"/",
	auth(),
	validateRequest(companyValidation.createCompanyValidationSchema),
	companyController.createCompany,
);

router.get(
	"/me",
	auth(UserRole.COMPANY_OWNER, UserRole.ASSESSMENT_CREATOR, UserRole.EVALUATOR),
	companyController.getMyCompany,
);

router.patch(
	"/me",
	auth(UserRole.COMPANY_OWNER),
	validateRequest(companyValidation.updateCompanyValidationSchema),
	companyController.updateCompany,
);

router.get(
	"/credits",
	auth(UserRole.COMPANY_OWNER),
	companyController.getCredits,
);

router.post(
	"/team/invite",
	auth(UserRole.COMPANY_OWNER),
	validateRequest(companyValidation.inviteTeamMemberValidationSchema),
	companyController.inviteTeamMember,
);

router.post(
	"/team/accept/:token",
	optionalAuth(),
	companyController.acceptTeamInvitation,
);

export const companyRoutes = router;
