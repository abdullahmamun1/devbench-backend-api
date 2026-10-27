import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type Request,
	type Response,
} from "express";
import helmet from "helmet";
import config from "./config";
import { globalErrorHandler } from "./middleware/globalErrorHandler";
import { notFound } from "./middleware/notFound";
import { rootRouter } from "./routes";

const app: Application = express();

// One proxy hop (Vercel's edge) sits in front of the API, so req.ip is the
// address it reports rather than a client-supplied X-Forwarded-For value.
app.set("trust proxy", 1);

app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));
app.use(helmet());
app.use(
	cors({
		origin: config.app_url,
		credentials: true,
	}),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req: Request, res: Response) => {
	res.send("DevBench API is running");
});

// Mount Centralized API v1 Routes
app.use("/api/v1", rootRouter);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
