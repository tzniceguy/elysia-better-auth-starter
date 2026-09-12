import { beforeEach, describe, expect, it, mock } from "bun:test";

const handlers: Record<string, (...args: unknown[]) => void> = {};
let workerName = "";
class MockWorker {
	constructor(name: string, handler: (job: unknown) => Promise<void>) {
		workerName = name;
		handlers.process = handler;
	}
	on(event: string, cb: (...args: unknown[]) => void) {
		handlers[event] = cb;
	}
}
mock.module("bullmq", () => ({ Worker: MockWorker }));

import {
	createNotificationWorker,
	type NotificationWorkerDeps,
} from "@api/minions/notification/notification.worker";
import type { Job } from "bullmq";

const selectResults: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];
const sentMails: unknown[] = [];
let mailShouldThrow = false;

const mockDb = {
	select: () => ({
		from: () => ({
			where: () => ({
				limit: async () => selectResults.splice(0, 1),
			}),
		}),
	}),
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: async () => {
				updateCalls.push(values);
			},
		}),
	}),
};

const mockMailer = {
	sendMail: async (input: unknown) => {
		if (mailShouldThrow) throw new Error("smtp down");
		sentMails.push(input);
	},
};

function makeDeps(): NotificationWorkerDeps {
	return {
		db: mockDb,
		connection: {},
		mailer: mockMailer,
	} as unknown as NotificationWorkerDeps;
}

function makeJob(outboxId: string): Job {
	return {
		name: "sendEmail",
		data: { outboxId },
		opts: { attempts: 5 },
		attemptsMade: 0,
	} as unknown as Job;
}

beforeEach(() => {
	selectResults.length = 0;
	updateCalls.length = 0;
	sentMails.length = 0;
	mailShouldThrow = false;
});

describe("notification minion", () => {
	it("registers the notificationQueue worker", async () => {
		const { worker } = await createNotificationWorker(makeDeps());
		expect(workerName).toBe("notificationQueue");
		expect(worker).toBeInstanceOf(MockWorker);
	});

	it("marks sent after mailer succeeds", async () => {
		selectResults.push({
			id: "ob-1",
			recipient: "a@example.com",
			subject: "Hi",
			bodyHtml: "<p>Hi</p>",
			status: "pending",
			attempts: 0,
		});
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("ob-1"));

		expect(sentMails).toHaveLength(1);
		expect(updateCalls[0]).toMatchObject({ status: "sent" });
	});

	it("skips already-sent rows", async () => {
		selectResults.push({ id: "ob-1", status: "sent" });
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("ob-1"));

		expect(sentMails).toHaveLength(0);
		expect(updateCalls).toHaveLength(0);
	});

	it("retries without throwing when mailer fails", async () => {
		mailShouldThrow = true;
		selectResults.push({
			id: "ob-1",
			recipient: "a@example.com",
			subject: "Hi",
			bodyHtml: "<p>Hi</p>",
			status: "pending",
			attempts: 0,
		});
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("ob-1"));

		expect(updateCalls[0]).toMatchObject({ status: "pending", attempts: 1 });
	});

	it("marks failed after max attempts", async () => {
		mailShouldThrow = true;
		selectResults.push({
			id: "ob-1",
			recipient: "a@example.com",
			subject: "Hi",
			bodyHtml: "<p>Hi</p>",
			status: "pending",
			attempts: 4,
		});
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("ob-1"));

		expect(updateCalls[0]).toMatchObject({ status: "failed", attempts: 5 });
	});
});
