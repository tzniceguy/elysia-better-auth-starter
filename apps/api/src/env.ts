import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.url(),
		BETTER_AUTH_SECRET: z.string().min(1),
		BETTER_AUTH_URL: z.string().url(),
		DB_PORT: z.string(),
		PORT: z.string().default("8080"),
		STORAGE_ACCESS_KEY_ID: z.string().min(1),
		STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
		STORAGE_ENDPOINT: z.string().min(1),
		STORAGE_REGION: z.string().min(1),
		STORAGE_RAW_BUCKET: z.string().min(1),
		STORAGE_PUBLIC_BUCKET: z.string().min(1),
		STORAGE_PUBLIC_URL: z.string().url(),
		REDIS_HOST: z.string().min(1),
		REDIS_PORT: z.coerce.number().int().positive(),
	},
	runtimeEnv: process.env,
});
