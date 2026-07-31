import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { env } from "../env";

const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	emailAndPassword: {
		enabled: true,
	},
	user: {
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
