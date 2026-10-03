import config from "../../config";
import { transporter } from "../../lib/nodemailer";

type ContactPayload = {
	name: string;
	email: string;
	subject: string;
	message: string;
};

// The message goes into an HTML email, so escape what the visitor typed
const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const sendContactMessage = async (payload: ContactPayload) => {
	const to = config.admin_email || config.smtp_user;

	await transporter.sendMail({
		from: config.mail_from,
		to,
		replyTo: `"${payload.name.replaceAll('"', "")}" <${payload.email}>`,
		subject: `[DevBench contact] ${payload.subject}`,
		html: `
			<p><b>From:</b> ${escapeHtml(payload.name)} (${escapeHtml(payload.email)})</p>
			<p><b>Subject:</b> ${escapeHtml(payload.subject)}</p>
			<p style="white-space:pre-wrap">${escapeHtml(payload.message)}</p>
		`,
	});

	return null;
};

export const contactService = {
	sendContactMessage,
};
