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
	type AccountWorkerDeps,
	createAccountWorker,
} from "@api/minions/account/account.worker";
import type { Job } from "bullmq";

const selectResults: unknown[][] = [];
const updateCalls: Record<string, unknown>[] = [];
const insertCalls: Record<string, unknown>[] = [];
const deletedWheres: unknown[] = [];
const enqueued: unknown[] = [];

const mockDb = {
	select: () => ({
		from: () => ({
			where: () => ({
				limit: async () => selectResults.shift() ?? [],
			}),
		}),
	}),
	delete: () => ({
		where: async (where: unknown) => {
			deletedWheres.push(where);
		},
	}),
	insert: () => ({
		values: async (values: Record<string, unknown>) => {
			insertCalls.push(values);
		},
	}),
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: async () => {
				updateCalls.push(values);
			},
		}),
	}),
};

function makeDeps(): AccountWorkerDeps {
	return {
		db: mockDb,
		connection: {},
		enqueueEmail: async (input: unknown) => {
			enqueued.push(input);
		},
	} as unknown as AccountWorkerDeps;
}

function makeJob(userId: string | undefined): Job {
	return {
		name: "purgeCustomer",
		data: { userId },
		opts: {},
		attemptsMade: 0,
	} as unknown as Job;
}

beforeEach(() => {
	selectResults.length = 0;
	updateCalls.length = 0;
	insertCalls.length = 0;
	deletedWheres.length = 0;
	enqueued.length = 0;
});

describe("account minion", () => {
	it("registers the accountQueue worker", async () => {
		const { worker } = await createAccountWorker(makeDeps());
		expect(workerName).toBe("accountQueue");
		expect(worker).toBeInstanceOf(MockWorker);
	});

	it("purges the user and tracks the outbox event as completed", async () => {
		selectResults.push([{ id: "cus-1" }], [{ email: "a@example.com" }]);
		const { purgeCustomer } = await createAccountWorker(makeDeps());

		await purgeCustomer(makeJob("usr-1"));

		expect(deletedWheres).toHaveLength(1);
		expect(insertCalls[0]).toMatchObject({
			eventType: "account.purge",
			resourceId: "usr-1",
			status: "pending",
		});
		expect(updateCalls[0]).toMatchObject({ status: "completed" });
		expect(enqueued).toHaveLength(1);
		expect(enqueued[0]).toMatchObject({
			to: "a@example.com",
			kind: "account_deleted",
		});
	});

	it("no-ops when no purgeable customer exists", async () => {
		selectResults.push([]);
		const { purgeCustomer } = await createAccountWorker(makeDeps());

		await purgeCustomer(makeJob("usr-1"));

		expect(deletedWheres).toHaveLength(0);
		expect(insertCalls).toHaveLength(0);
		expect(updateCalls).toHaveLength(0);
	});

	it("no-ops without a userId", async () => {
		const { purgeCustomer } = await createAccountWorker(makeDeps());

		await purgeCustomer(makeJob(undefined));

		expect(insertCalls).toHaveLength(0);
		expect(deletedWheres).toHaveLength(0);
	});
});
