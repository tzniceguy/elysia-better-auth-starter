import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { env } from "../env";
import {
	changeEmailConfirmTemplate,
	resetPasswordTemplate,
	verifyEmailTemplate,
} from "./mail";

async function enqueueTemplate(
	to: string,
	template: { subject: string; html: string },
	kind: string,
): Promise<void> {
	const [{ notificationQueue }, enqueueMod] = await Promise.all([
		import("@api/minions/notification/notification.queue"),
		import("@api/minions/notification/enqueue"),
	]);
	await enqueueMod.enqueueEmail(db, notificationQueue, {
		to,
		subject: template.subject,
		html: template.html,
		kind,
	});
}

const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	trustedOrigins: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await enqueueTemplate(user.email, verifyEmailTemplate(url), "verification");
		},
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
		sendResetPassword: async ({ user, url }) => {
			await enqueueTemplate(
				user.email,
				resetPasswordTemplate(url),
				"password_reset",
			);
		},
	},
	user: {
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ newEmail, url }) => {
				await enqueueTemplate(
					newEmail,
					changeEmailConfirmTemplate(url),
					"change_email",
				);
			},
		},
		additionalFields: {
			principalType: {
				type: ["staff", "customer"],
				required: true,
				defaultValue: "customer",
			},
			staffRole: {
				type: ["admin", "operations", "support"],
				required: false,
				input: false,
			},
		},
	},
});

export default auth;
