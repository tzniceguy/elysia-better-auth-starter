import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.url(),
		BETTER_AUTH_SECRET: z.string().min(1),
		BETTER_AUTH_URL: z.string().url(),
		DB_PORT: z.string(),
		PORT: z.string().default("8080"),
	},
	runtimeEnv: process.env,
});
