import { bullMQConnection } from "@api/utils/que-factory";
import { Queue } from "bullmq";

export const uploadQueue = new Queue("uploadQueue", {
	connection: bullMQConnection,
});
