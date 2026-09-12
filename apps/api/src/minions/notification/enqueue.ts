import type { db as Db } from "@api/db";
import { outbox } from "@api/db/schema";
import { generateId } from "@api/utils/id-generate";
import type { notificationQueue as NotificationQueue } from "@api/minions/notification/notification.queue";

export interface EnqueueEmailInput {
	to: string;
	subject: string;
	html: string;
	kind: string;
	metadata?: Record<string, unknown>;
}

export async function enqueueEmail(
	db: typeof Db,
	queue: typeof NotificationQueue,
	input: EnqueueEmailInput,
): Promise<string> {
	const id = generateId();
	await db.insert(outbox).values({
		id,
		recipient: input.to,
		subject: input.subject,
		bodyHtml: input.html,
		kind: input.kind,
		status: "pending",
		metadata: (input.metadata ?? null) as never,
	});
	await queue.add(
		"sendEmail",
		{ outboxId: id },
		{
			attempts: 5,
			backoff: { type: "exponential", delay: 5000 },
			removeOnComplete: true,
		},
	);
	return id;
}
