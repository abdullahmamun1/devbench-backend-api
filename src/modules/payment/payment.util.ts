import type Stripe from "stripe";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../utils/auditLog";

const handleSessionCompleted = async (session: Stripe.Checkout.Session) => {
	await prisma.$transaction(async (tx) => {
		const payment = await tx.payment.findUnique({
			where: { stripeSessionId: session.id },
		});

		if (!payment) {
			console.error(`Webhook received for unknown session: ${session.id}`);
			return;
		}

		const claimed = await tx.payment.updateMany({
			where: { id: payment.id, status: { not: "SUCCEEDED" } },
			data: { status: "SUCCEEDED" },
		});

		if (claimed.count === 0) {
			return; // already processed by a concurrent/earlier delivery
		}

		const owner = await tx.user.findFirst({
			where: { companyId: payment.companyId, role: "COMPANY_OWNER" },
		});

		const company = await tx.company.update({
			where: { id: payment.companyId },
			data: { creditBalance: { increment: payment.creditsPurchased } },
		});

		await tx.creditTransaction.create({
			data: {
				companyId: payment.companyId,
				type: "PURCHASE",
				amount: payment.creditsPurchased,
				balanceAfter: company.creditBalance,
				referenceId: payment.id,
			},
		});

		if (owner) {
			await writeAuditLog(
				{
					actorId: owner.id,
					actorRole: "COMPANY_OWNER",
					action: "PAYMENT_SUCCEEDED",
					entityType: "Payment",
					entityId: payment.id,
					metadata: {
						creditsPurchased: payment.creditsPurchased,
						amount: payment.amount,
					},
				},
				tx,
			);
		} else {
			console.error(
				`No COMPANY_OWNER found for company ${payment.companyId} — cannot attribute audit log`,
			);
		}
	});
};

const handleSessionExpired = async (session: Stripe.Checkout.Session) => {
	await prisma.payment.updateMany({
		where: { stripeSessionId: session.id, status: "PENDING" },
		data: { status: "FAILED" },
	});
};

export const paymentUtil = {
	handleSessionCompleted,
	handleSessionExpired,
};
