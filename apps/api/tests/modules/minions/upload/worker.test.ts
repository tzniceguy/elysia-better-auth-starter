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
	createUploadWorker,
	PermanentProcessingError,
	type UploadWorkerDeps,
} from "@api/minions/upload/upload.worker";
import type { Job } from "bullmq";

const selectResults: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];
const rawFileBuffers: ArrayBuffer[] = [];
const deletedKeys: string[] = [];
const publicWrites: {
	key: string;
	data: Uint8Array | ArrayBuffer;
	type: string;
}[] = [];

const mockDb = {
	select: () => ({
		from: () => ({
			where: () => ({
				limit: async () => selectResults.splice(0, 1),
			}),
		}),
	}),
	insert: () => ({
		values: () => ({
			returning: async () => [],
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

const mockS3 = {
	rawS3: {
		file: () => ({
			arrayBuffer: async () => rawFileBuffers.shift() ?? new Uint8Array(0),
		}),
		delete: async (key: string) => {
			deletedKeys.push(key);
		},
	},
	publicS3: {
		write: async (
			key: string,
			data: Uint8Array | ArrayBuffer,
			opts: { type: string },
		) => {
			publicWrites.push({ key, data, type: opts.type });
		},
	},
	buildPublicUrl: (key: string) => `https://public.example/${key}`,
	toPublicKey: (assetId: string, mimeType: string) =>
		mimeType.startsWith("image/")
			? `assets/${assetId}.webp`
			: `assets/${assetId}.pdf`,
};

function makeDeps(): UploadWorkerDeps {
	return {
		db: mockDb,
		s3: mockS3,
		connection: {},
	} as unknown as UploadWorkerDeps;
}

const PNG_BYTES = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
	),
	(c) => c.charCodeAt(0),
);

function makeJob(overrides?: Record<string, unknown>): Job {
	return {
		name: "processUpload",
		data: {
			assetId: "asset-1",
			fileKey: "images/raw.png",
			mimeType: "image/png",
		},
		opts: { attempts: 5 },
		attemptsMade: 0,
		...overrides,
	} as unknown as Job;
}

beforeEach(() => {
	selectResults.length = 0;
	updateCalls.length = 0;
	rawFileBuffers.length = 0;
	deletedKeys.length = 0;
	publicWrites.length = 0;
});

describe("uploads worker", () => {
	it("registers in the uploadQueue worker", async () => {
		const { worker } = await createUploadWorker(makeDeps());

		expect(workerName).toBe("uploadQueue");
		expect(worker).toBeInstanceOf(MockWorker);
	});

	it("transcodes images to WebP, writes public and sets ready", async () => {
		rawFileBuffers.push(PNG_BYTES.buffer);
		selectResults.push({
			id: "asset-1",
			status: "uploading",
			storageUrl: "",
			mimeType: "image/png",
			fileSize: 4000,
		});
		const { processUpload } = await createUploadWorker(makeDeps());

		await processUpload(makeJob());

		expect(publicWrites).toHaveLength(1);
		expect(publicWrites[0]).toMatchObject({
			key: "assets/asset-1.webp",
			type: "image/webp",
		});
		expect(updateCalls).toHaveLength(2);
		expect(updateCalls[1]).toMatchObject({
			status: "ready",
			storageUrl: "https://public.example/assets/asset-1.webp",
			mimeType: "image/webp",
		});
		expect(deletedKeys).toEqual(["images/raw.png"]);
	});

	it("passes PDFs through unchanged", async () => {
		rawFileBuffers.push(Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer);
		selectResults.push({
			id: "asset-1",
			status: "uploading",
			storageUrl: "",
			mimeType: "application/pdf",
			fileSize: 100,
		});
		const { processUpload } = await createUploadWorker(makeDeps());

		await processUpload(
			makeJob({
				data: {
					assetId: "asset-1",
					fileKey: "documents/raw.pdf",
					mimeType: "application/pdf",
				},
			}),
		);

		expect(publicWrites).toHaveLength(1);
		expect(publicWrites[0]).toMatchObject({
			key: "assets/asset-1.pdf",
			type: "application/pdf",
		});
		expect(updateCalls[1]).toMatchObject({
			status: "ready",
			mimeType: "application/pdf",
		});
		expect(deletedKeys).toEqual(["documents/raw.pdf"]);
	});

	it("no-ops when the asset is already ready", async () => {
		selectResults.push({
			id: "asset-1",
			status: "ready",
			storageUrl: "https://public.example/assets/asset-1.webp",
			mimeType: "image/webp",
		});
		const { processUpload } = await createUploadWorker(makeDeps());

		await processUpload(makeJob());

		expect(updateCalls).toHaveLength(0);
		expect(publicWrites).toHaveLength(0);
	});

	it("marks empty images as permanent failures", async () => {
		rawFileBuffers.push(new Uint8Array(0).buffer);
		selectResults.push({
			id: "asset-1",
			status: "uploading",
			storageUrl: "",
			mimeType: "image/png",
			fileSize: 0,
		});
		const { processUpload } = await createUploadWorker(makeDeps());

		await expect(processUpload(makeJob())).rejects.toThrow(
			PermanentProcessingError,
		);

		expect(updateCalls[1]?.status).toBe("failed");
		expect(deletedKeys).toEqual(["images/raw.png"]);
	});

	it("marks the asset failed when a final job attempt fails", async () => {
		const { worker } = await createUploadWorker(makeDeps());
		const failedHandler = handlers.failed;
		expect(failedHandler).toBeDefined();

		await failedHandler?.(
			makeJob({ attemptsMade: 5 }),
			new Error("transient failure"),
		);

		expect(updateCalls[0]?.status).toBe("failed");
		expect(deletedKeys).toEqual(["images/raw.png"]);
		void worker;
	});
});
