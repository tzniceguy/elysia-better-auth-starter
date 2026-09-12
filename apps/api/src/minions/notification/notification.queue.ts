import { bullMQConnection } from "@api/utils/que-factory";
import { Queue } from "bullmq";

export const notificationQueue = new Queue("notificationQueue", {
	connection: bullMQConnection,
});
