import config from "../../config";
import { prisma } from "../../lib/prisma";
import { stripe } from "../../lib/stripe";
import { createError } from "../../utils/createError";
import type {
	ICallerInfo,
	ICreateSessionPayload,
	IPaymentFilterQuery,
} from "./payment.interface";

const createCheckoutSession = async (
	payload: ICreateSessionPayload,
	caller: ICallerInfo,
) => {
	if (!caller.companyId) {
		throw createError(400, "You must belong to a company to purchase credits");
	}

	const amount = payload.credits * config.credit_price_in_cents;

	const session = await stripe.checkout.sessions.create({
		mode: "payment",
		payment_method_types: ["card"],
		line_items: [
			{
				price_data: {
					currency: "usd",
					product_data: { name: `${payload.credits} DevBench credits` },
					unit_amount: amount,
				},
				quantity: 1,
			},
		],
		metadata: {
			companyId: caller.companyId,
			credits: String(payload.credits),
		},
		success_url: `${config.app_url}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${config.app_url}/billing/cancel`,
	});

	await prisma.payment.create({
		data: {
			companyId: caller.companyId,
			stripeSessionId: session.id,
			amount,
			creditsPurchased: payload.credits,
			status: "PENDING",
		},
	});

	return { checkoutUrl: session.url };
};

const handleWebhook = async (rawBody: Buffer, signature: string) => {};

const getPaymentHistory = async (
	query: IPaymentFilterQuery,
	caller: ICallerInfo,
) => {};

export const paymentService = {
	createCheckoutSession,
	handleWebhook,
	getPaymentHistory,
};
