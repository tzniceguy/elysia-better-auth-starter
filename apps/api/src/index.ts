import { createApp } from "./app";
import { env } from "./env";
import { createUploadWorker } from "./queues/upload/upload.worker";

const app = await createApp();
const uploadWorker = await createUploadWorker();

app.listen({
	port: env.PORT,
	hostname: "0.0.0.0",
});

void uploadWorker;
