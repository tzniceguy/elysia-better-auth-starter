import type { db as Db } from "@api/db";
import { outboxEvent } from "@api/db/schema";
import { completeEvent, failEvent } from "@api/lib/outbox";
import type { Mailer } from "@api/utils/mail";
import type { bullMQConnection as BullMQConnection } from "@api/utils/que-factory";
import { type Job, Worker } from "bullmq";
import { eq } from "drizzle-orm";

export interface NotificationWorkerDeps {
	db: typeof Db;
	connection: typeof BullMQConnection;
	mailer: Mailer;
}

export interface NotificationWorker {
	worker: Worker;
	sendEmail(job: Job): Promise<void>;
}

export interface EmailPayload {
	to: string;
	subject: string;
	html: string;
	kind?: string;
	metadata?: Record<string, unknown> | null;
}

const MAX_ATTEMPTS = 5;

let cachedDeps: NotificationWorkerDeps | null = null;

async function loadDeps(): Promise<NotificationWorkerDeps> {
	if (cachedDeps) return cachedDeps;
	const [dbMod, queueMod, mailMod] = await Promise.all([
		import("@api/db"),
		import("@api/utils/que-factory"),
		import("@api/utils/mail"),
	]);
	cachedDeps = {
		db: dbMod.db,
		connection: queueMod.bullMQConnection,
		mailer: mailMod.mailer,
	};
	return cachedDeps;
}

export async function createNotificationWorker(
	deps: Partial<NotificationWorkerDeps> = {},
): Promise<NotificationWorker> {
	const resolved =
		deps.db && deps.connection && deps.mailer
			? (deps as NotificationWorkerDeps)
			: await loadDeps();

	async function sendEmail(job: Job) {
		const { db, mailer } = resolved;
		const { outboxEventId } = job.data as { outboxEventId: string };
		if (!outboxEventId) return;

		const [row] = await db
			.select()
			.from(outboxEvent)
			.where(eq(outboxEvent.id, outboxEventId))
			.limit(1);

		if (!row || row.status === "completed") return;

		const payload = (row.payload ?? {}) as Partial<EmailPayload>;
		if (!payload.to || !payload.subject || !payload.html) {
			await failEvent(db, outboxEventId, "Malformed email payload");
			return;
		}

		try {
			await mailer.sendMail({
				to: payload.to,
				subject: payload.subject,
				html: payload.html,
			});
			await completeEvent(db, outboxEventId);
		} catch (e) {
			const attempts = (row.attempts ?? 0) + 1;
			const message = e instanceof Error ? e.message : String(e);
			const failed = attempts >= MAX_ATTEMPTS;
			await failEvent(db, outboxEventId, message, {
				attempts,
				retryAt: failed ? null : new Date(Date.now() + 5000 * attempts),
			});
		}
	}

	const worker = new Worker(
		"notificationQueue",
		async (job: Job) => {
			if (job.name === "sendEmail") {
				await sendEmail(job);
			}
		},
		{ connection: resolved.connection },
	);

	worker.on("completed", () => {});
	worker.on("failed", () => {});

	return { worker, sendEmail };
}
