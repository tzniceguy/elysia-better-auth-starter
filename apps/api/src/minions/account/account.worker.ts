import type { db as Db } from "@api/db";
import { customer, user } from "@api/db/schema";
import type { bullMQConnection as BullMQConnection } from "@api/utils/que-factory";
import { type Job, Worker } from "bullmq";
import { and, eq, lte } from "drizzle-orm";

export interface AccountWorkerDeps {
	db: typeof Db;
	connection: typeof BullMQConnection;
	enqueueEmail?: (input: {
		to: string;
		subject: string;
		html: string;
		kind: string;
	}) => Promise<void>;
}

export interface AccountWorker {
	worker: Worker;
	purgeCustomer(job: Job): Promise<void>;
}

let cachedDeps: AccountWorkerDeps | null = null;

async function loadDeps(): Promise<AccountWorkerDeps> {
	if (cachedDeps) return cachedDeps;
	const [dbMod, queueMod] = await Promise.all([
		import("@api/db"),
		import("@api/utils/que-factory"),
	]);
	cachedDeps = { db: dbMod.db, connection: queueMod.bullMQConnection };
	return cachedDeps;
}

export async function createAccountWorker(
	deps: Partial<AccountWorkerDeps> = {},
): Promise<AccountWorker> {
	const resolved =
		deps.db && deps.connection ? (deps as AccountWorkerDeps) : await loadDeps();

	async function purgeCustomer(job: Job) {
		const { db } = resolved;
		const { userId } = job.data as { userId: string };
		if (!userId) return;

		const [row] = await db
			.select({ id: customer.id })
			.from(customer)
			.where(
				and(
					eq(customer.userId, userId),
					eq(customer.status, "deletion_pending"),
					lte(customer.deletedAt, new Date()),
				),
			)
			.limit(1);

		if (!row) return;

		const [account] = await db
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		await db.delete(user).where(eq(user.id, userId));

		if (account?.email) {
			try {
				if (resolved.enqueueEmail) {
					const mailMod = await import("@api/utils/mail");
					const template = mailMod.noticeTemplate(
						"Account deleted",
						"Your account has been permanently deleted as requested.",
					);
					await resolved.enqueueEmail({
						to: account.email,
						subject: template.subject,
						html: template.html,
						kind: "account_deleted",
					});
				} else {
					const queueMod = await import(
						"@api/minions/notification/notification.queue"
					);
					const enqueueMod = await import(
						"@api/minions/notification/enqueue"
					);
					const mailMod = await import("@api/utils/mail");
					const template = mailMod.noticeTemplate(
						"Account deleted",
						"Your account has been permanently deleted as requested.",
					);
					await enqueueMod.enqueueEmail(db, queueMod.notificationQueue, {
						to: account.email,
						subject: template.subject,
						html: template.html,
						kind: "account_deleted",
					});
				}
			} catch {
				// notification is best-effort
			}
		}
	}

	const worker = new Worker(
		"accountQueue",
		async (job: Job) => {
			if (job.name === "purgeCustomer") {
				await purgeCustomer(job);
			}
		},
		{ connection: resolved.connection },
	);

	worker.on("completed", () => {});
	worker.on("failed", () => {});

	return { worker, purgeCustomer };
}
