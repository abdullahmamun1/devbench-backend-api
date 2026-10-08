import type { SendMailOptions } from "nodemailer";
import { transporter } from "../lib/nodemailer";

/** Returns true if the email was handed to the mail server, false if it failed. */
export const trySendMail = async (
	options: SendMailOptions,
): Promise<boolean> => {
	try {
		await transporter.sendMail(options);
		return true;
	} catch (error) {
		console.error("Email delivery failed:", error);
		return false;
	}
};
