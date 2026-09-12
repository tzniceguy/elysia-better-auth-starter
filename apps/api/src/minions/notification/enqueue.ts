import type { db as Db } from "@api/db";
import { recordEvent } from "@api/lib/outbox";
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
	const id = await recordEvent(db, {
		eventType: "email.requested",
		resourceId: input.to,
		payload: {
			to: input.to,
			subject: input.subject,
			html: input.html,
			kind: input.kind,
			metadata: input.metadata ?? null,
		},
	});
	await queue.add(
		"sendEmail",
		{ outboxEventId: id },
		{
			attempts: 5,
			backoff: { type: "exponential", delay: 5000 },
			removeOnComplete: true,
		},
	);
	return id;
}
