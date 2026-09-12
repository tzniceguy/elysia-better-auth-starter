import { bullMQConnection } from "@api/utils/que-factory";
import { Queue } from "bullmq";

export const accountQueue = new Queue("accountQueue", {
	connection: bullMQConnection,
});
