import { createApp } from "./app";
import { env } from "./env";
import { createAccountWorker } from "./minions/account/account.worker";
import { createNotificationWorker } from "./minions/notification/notification.worker";
import { createUploadWorker } from "./minions/upload/upload.worker";

const app = await createApp();
const accountWorker = await createAccountWorker();
const uploadWorker = await createUploadWorker();
const notificationWorker = await createNotificationWorker();

app.listen({
	port: env.PORT,
	hostname: "0.0.0.0",
});

void accountWorker;
void uploadWorker;
void notificationWorker;
