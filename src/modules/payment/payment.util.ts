import path from "node:path";
import ejs from "ejs";
import type Stripe from "stripe";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../utils/auditLog";

const handleSessionCompleted = async (session: Stripe.Checkout.Session) => {
	const confirmation = await prisma.$transaction(async (tx) => {
		const payment = await tx.payment.findUnique({
			where: { stripeSessionId: session.id },
		});

		if (!payment) {
			console.error(`Webhook received for unknown session: ${session.id}`);
			return null;
		}

		const claimed = await tx.payment.updateMany({
			where: { id: payment.id, status: { not: "SUCCEEDED" } },
			data: { status: "SUCCEEDED" },
		});

		if (claimed.count === 0) {
			return null; // already processed by a concurrent/earlier delivery
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

		if (!owner) {
			console.error(
				`No COMPANY_OWNER found for company ${payment.companyId} — cannot attribute audit log`,
			);
			return null;
		}

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

		return { owner, company, payment };
	});

	// Sent after the commit: a slow mail server must not time out the
	// transaction, roll back the credits and make Stripe retry the webhook.
	if (!confirmation) return;
	const { owner, company, payment } = confirmation;
	try {
		const templatePath = path.join(
			process.cwd(),
			"src/templates/payment-success.ejs",
		);
		const html = await ejs.renderFile(templatePath, {
			companyName: company.companyName,
			creditsPurchased: payment.creditsPurchased,
			amountPaid: (payment.amount / 100).toFixed(2),
		});

		await transporter.sendMail({
			from: config.mail_from,
			to: owner.email,
			subject: "Payment confirmed — DevBench",
			html,
		});
	} catch (emailError) {
		console.error("Payment confirmation email failed:", emailError);
	}
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
