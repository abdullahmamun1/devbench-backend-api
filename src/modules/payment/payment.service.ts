import type Stripe from "stripe";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { stripe } from "../../lib/stripe";
import { createError } from "../../utils/createError";
import type {
	ICallerInfo,
	ICreateSessionPayload,
	IPaymentFilterQuery,
} from "./payment.interface";
import { paymentUtil } from "./payment.util";

const createCheckoutSession = async (
	payload: ICreateSessionPayload,
	caller: ICallerInfo,
) => {
	if (!caller.companyId) {
		throw createError(400, "You must belong to a company to purchase credits");
	}

	const existingPending = await prisma.payment.findFirst({
		where: { companyId: caller.companyId, status: "PENDING" },
		orderBy: { createdAt: "desc" },
	});

	if (existingPending) {
		const session = await stripe.checkout.sessions.retrieve(
			existingPending.stripeSessionId,
		);
		if (session.status === "open") {
			return { checkoutUrl: session.url, payment: existingPending };
		}
	}

	const totalAmount = payload.credits * config.credit_price_in_cents;

	const session = await stripe.checkout.sessions.create({
		mode: "payment",
		payment_method_types: ["card"],
		line_items: [
			{
				price_data: {
					currency: "usd",
					product_data: { name: "DevBench credit" },
					unit_amount: config.credit_price_in_cents,
				},
				quantity: payload.credits,
			},
		],
		metadata: { companyId: caller.companyId, credits: String(payload.credits) },
		success_url: `${config.app_url}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${config.app_url}/billing/cancel`,
	});

	const payment = await prisma.payment.create({
		data: {
			companyId: caller.companyId,
			stripeSessionId: session.id,
			amount: totalAmount,
			creditsPurchased: payload.credits,
			status: "PENDING",
		},
	});

	return { checkoutUrl: session.url, payment };
};

const handleWebhook = async (rawBody: Buffer, signature: string) => {
	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(
			rawBody,
			signature,
			config.stripe_webhook_secret,
		);
	} catch (error) {
		console.error("Stripe webhook signature verification failed:", error);
		throw createError(400, "Invalid webhook signature");
	}

	switch (event.type) {
		case "checkout.session.completed":
			await paymentUtil.handleSessionCompleted(
				event.data.object as Stripe.Checkout.Session,
			);
			break;
		case "checkout.session.expired":
			await paymentUtil.handleSessionExpired(
				event.data.object as Stripe.Checkout.Session,
			);
			break;
	}

	return { received: true };
};

const getPaymentHistory = async (
	query: IPaymentFilterQuery,
	caller: ICallerInfo,
) => {
	if (!caller.companyId) {
		throw createError(
			400,
			"You must belong to a company to view payment history",
		);
	}

	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const skip = (page - 1) * limit;

	const [total, data] = await Promise.all([
		prisma.payment.count({ where: { companyId: caller.companyId } }),
		prisma.payment.findMany({
			where: { companyId: caller.companyId },
			skip,
			take: limit,
			orderBy: { createdAt: "desc" },
		}),
	]);

	return { meta: { page, limit, total }, data };
};

export const paymentService = {
	createCheckoutSession,
	handleWebhook,
	getPaymentHistory,
};
