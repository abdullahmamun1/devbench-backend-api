import { Router } from "express";
import { auth } from "../../middleware/auth";
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
	auth("COMPANY_OWNER", "ASSESSMENT_CREATOR", "EVALUATOR"),
	companyController.getMyCompany,
);

router.patch(
	"/me",
	auth("COMPANY_OWNER"),
	validateRequest(companyValidation.updateCompanyValidationSchema),
	companyController.updateCompany,
);

router.get("/credits", auth("COMPANY_OWNER"), companyController.getCredits);

router.post(
	"/team/invite",
	auth("COMPANY_OWNER"),
	validateRequest(companyValidation.inviteTeamMemberValidationSchema),
	companyController.inviteTeamMember,
);

router.post("/team/accept/:token", companyController.acceptTeamInvitation);

export const companyRoutes = router;
