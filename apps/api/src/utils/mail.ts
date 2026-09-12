import { env } from "@api/env";
import { Resend } from "resend";

export interface SendMailInput {
	to: string;
	subject: string;
	html: string;
}

export interface Mailer {
	sendMail(input: SendMailInput): Promise<void>;
}

let cachedClient: Resend | null = null;

function getClient(): Resend {
	if (cachedClient) return cachedClient;
	if (!env.RESEND_KEY) {
		throw new Error("RESEND_KEY is not configured. Set it to send emails.");
	}
	cachedClient = new Resend(env.RESEND_KEY);
	return cachedClient;
}

function layout(title: string, body: string): string {
	return `<!doctype html>
<html>
	<body style="font-family: sans-serif; line-height: 1.6; color: #0f172a;">
		<h2>${title}</h2>
		${body}
		<p style="color: #64748b; font-size: 12px;">Platform</p>
	</body>
</html>`;
}

function linkButton(url: string, label: string): string {
	return `<p><a href="${url}" style="display: inline-block; padding: 10px 20px; background: #19a83e; color: #ffffff; text-decoration: none; border-radius: 6px;">${label}</a></p><p>Or copy this link:<br /><span style="word-break: break-all;">${url}</span></p>`;
}

export function verifyEmailTemplate(url: string): {
	subject: string;
	html: string;
} {
	return {
		subject: "Verify your email",
		html: layout(
			"Verify your email",
			`<p>Confirm your email address to finish setting up your account.</p>${linkButton(url, "Verify email")}`,
		),
	};
}

export function resetPasswordTemplate(url: string): {
	subject: string;
	html: string;
} {
	return {
		subject: "Reset your password",
		html: layout(
			"Reset your password",
			`<p>Click below to set a new password. If you did not request this, ignore this email.</p>${linkButton(url, "Reset password")}`,
		),
	};
}

export function changeEmailConfirmTemplate(url: string): {
	subject: string;
	html: string;
} {
	return {
		subject: "Confirm your new email",
		html: layout(
			"Confirm your new email",
			`<p>Click below to confirm this address for your account.</p>${linkButton(url, "Confirm email")}`,
		),
	};
}

export function deleteConfirmTemplate(url: string): {
	subject: string;
	html: string;
} {
	return {
		subject: "Confirm account deletion",
		html: layout(
			"Confirm account deletion",
			`<p>You requested to delete your account. Click below to confirm.</p>${linkButton(url, "Confirm deletion")}`,
		),
	};
}

export function noticeTemplate(
	subject: string,
	message: string,
): {
	subject: string;
	html: string;
} {
	return {
		subject,
		html: layout(subject, `<p>${message}</p>`),
	};
}

export function createMailer(client?: {
	emails: { send(input: Record<string, unknown>): Promise<unknown> };
}): Mailer {
	async function sendMail(input: SendMailInput): Promise<void> {
		if (client) {
			await client.emails.send({
				from: env.EMAIL_FROM,
				to: input.to,
				subject: input.subject,
				html: input.html,
			});
			return;
		}
		const { error } = await getClient().emails.send({
			from: env.EMAIL_FROM,
			to: input.to,
			subject: input.subject,
			html: input.html,
		});
		if (error) {
			throw new Error(`Failed to send email: ${error.message}`);
		}
	}

	return { sendMail };
}

export const mailer = createMailer();
