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

function makeJob(outboxEventId: string): Job {
	return {
		name: "sendEmail",
		data: { outboxEventId },
		opts: { attempts: 5 },
		attemptsMade: 0,
	} as unknown as Job;
}

function emailEvent(overrides: Record<string, unknown> = {}) {
	return {
		id: "evt-1",
		eventType: "email.requested",
		resourceId: "a@example.com",
		status: "pending",
		payload: {
			to: "a@example.com",
			subject: "Hi",
			html: "<p>Hi</p>",
			kind: "verification",
		},
		attempts: 0,
		...overrides,
	};
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

	it("marks the event completed after mailer succeeds", async () => {
		selectResults.push(emailEvent());
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("evt-1"));

		expect(sentMails).toHaveLength(1);
		expect(sentMails[0]).toMatchObject({
			to: "a@example.com",
			subject: "Hi",
		});
		expect(updateCalls[0]).toMatchObject({ status: "completed" });
	});

	it("skips already-completed events", async () => {
		selectResults.push(emailEvent({ status: "completed" }));
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("evt-1"));

		expect(sentMails).toHaveLength(0);
		expect(updateCalls).toHaveLength(0);
	});

	it("fails malformed payloads without sending", async () => {
		selectResults.push(emailEvent({ payload: { to: "a@example.com" } }));
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("evt-1"));

		expect(sentMails).toHaveLength(0);
		expect(updateCalls[0]).toMatchObject({ status: "failed" });
	});

	it("retries without throwing when mailer fails", async () => {
		mailShouldThrow = true;
		selectResults.push(emailEvent());
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("evt-1"));

		expect(updateCalls[0]).toMatchObject({ status: "pending", attempts: 1 });
	});

	it("marks failed after max attempts", async () => {
		mailShouldThrow = true;
		selectResults.push(emailEvent({ attempts: 4 }));
		const { sendEmail } = await createNotificationWorker(makeDeps());

		await sendEmail(makeJob("evt-1"));

		expect(updateCalls[0]).toMatchObject({ status: "failed", attempts: 5 });
	});
});
