import { Router } from "express";
import { UserRole } from "../../../generated/prisma";
import { auth } from "../../middleware/auth";
import { attemptController } from "./attempt.controller";

const router = Router();

router.get("/:id", auth(UserRole.CANDIDATE), attemptController.getAttemptById);

export const attemptRoutes = router;
