import { env } from "@api/env";
import type { ConnectionOptions } from "bullmq";

export const bullMQConnection: ConnectionOptions = {
	host: env.REDIS_HOST,
	port: env.REDIS_PORT,
	maxRetriesPerRequest: null,
	enableReadyCheck: false,
};
