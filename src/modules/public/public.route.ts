import { Router } from "express";
import { rateLimiter } from "../../middleware/rateLimiter";
import { publicController } from "./public.controller";

const router = Router();

// No auth: read by the marketing site
router.get("/stats", rateLimiter(), publicController.getPublicStats);

export const publicRoutes = router;
