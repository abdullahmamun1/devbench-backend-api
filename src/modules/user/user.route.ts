import { Router } from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { userController } from "./user.controller";
import { userValidation } from "./user.validation";

const router = Router();

router.get("/me", auth(), userController.getMe);
router.patch(
	"/me",
	auth(),
	validateRequest(userValidation.updateProfileValidationSchema),
	userController.updateMe,
);

export const userRoutes = router;
