import type { db as Db } from "@api/db";
import { outboxEvent } from "@api/db/schema";
import { generateId } from "@api/utils/id-generate";
import { eq } from "drizzle-orm";

export interface RecordEventInput {
	eventType: string;
	resourceId: string;
	payload?: Record<string, unknown>;
}

export interface FailEventOptions {
	/** Attempts so far (1-based). Defaults to 1 for single-shot completions. */
	attempts?: number;
	/** When set, the event stays pending and is eligible for retry at this time. */
	retryAt?: Date | null;
}

/**
 * Generic transactional-outbox helpers shared by all minions.
 * Producers record a `pending` event alongside their state change;
 * the owning minion marks it `completed` or `failed`.
 */
export async function recordEvent(
	db: typeof Db,
	input: RecordEventInput,
): Promise<string> {
	const id = generateId();
	await db.insert(outboxEvent).values({
		id,
		eventType: input.eventType,
		resourceId: input.resourceId,
		status: "pending",
		payload: (input.payload ?? {}) as never,
	});
	return id;
}

export async function completeEvent(
	db: typeof Db,
	eventId: string,
): Promise<void> {
	await db
		.update(outboxEvent)
		.set({ status: "completed", lastError: null, updatedAt: new Date() })
		.where(eq(outboxEvent.id, eventId));
}

export async function failEvent(
	db: typeof Db,
	eventId: string,
	error: string,
	opts: FailEventOptions = {},
): Promise<void> {
	const attempts = opts.attempts ?? 1;
	const retryAt = opts.retryAt ?? null;
	await db
		.update(outboxEvent)
		.set({
			status: retryAt ? "pending" : "failed",
			attempts,
			lastError: error,
			nextRetryAt: retryAt,
			updatedAt: new Date(),
		})
		.where(eq(outboxEvent.id, eventId));
}
