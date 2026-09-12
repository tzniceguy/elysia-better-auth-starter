import type { db as Db } from "@api/db";
import { outbox } from "@api/db/schema";
import type { bullMQConnection as BullMQConnection } from "@api/utils/que-factory";
import type { Mailer } from "@api/utils/mail";
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
		const { outboxId } = job.data as { outboxId: string };
		if (!outboxId) return;

		const [row] = await db
			.select()
			.from(outbox)
			.where(eq(outbox.id, outboxId))
			.limit(1);

		if (!row || row.status === "sent") return;

		try {
			await mailer.sendMail({
				to: row.recipient,
				subject: row.subject,
				html: row.bodyHtml,
			});
			await db
				.update(outbox)
				.set({ status: "sent", sentAt: new Date(), lastError: null })
				.where(eq(outbox.id, outboxId));
		} catch (e) {
			const attempts = (row.attempts ?? 0) + 1;
			const message = e instanceof Error ? e.message : String(e);
			const failed = attempts >= MAX_ATTEMPTS;
			await db
				.update(outbox)
				.set({
					status: failed ? "failed" : "pending",
					attempts,
					lastError: message,
					nextRetryAt: failed ? null : new Date(Date.now() + 5000 * attempts),
				})
				.where(eq(outbox.id, outboxId));
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
