import { beforeEach, describe, expect, it } from "bun:test";

import {
	createUploadsService,
	type UploadsServiceDeps,
} from "@api/modules/uploads/service";

const selectResults: Record<string, unknown>[] = [];
const insertResults: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];
const queueJobs: unknown[][] = [];

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
			returning: async () => insertResults.splice(0, 1),
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

const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/avif",
	"application/pdf",
];

const mockS3 = {
	validateFile: (file: { mimeType: string; size: number }) => {
		if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
			return {
				valid: false,
				error: `File type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
			};
		}
		if (file.size > 5 * 1024 * 1024) {
			return { valid: false, error: "File size exceeds 5MB limit" };
		}
		return { valid: true };
	},
	generateRawKey: () => "images/123-abcd.jpg",
	rawS3: { presign: () => "https://upload.example/images/123-abcd.jpg" },
	buildPublicUrl: (key: string) => `https://public.example/${key}`,
	toPublicKey: (assetId: string, mimeType: string) =>
		mimeType.startsWith("image/")
			? `assets/${assetId}.webp`
			: `assets/${assetId}.pdf`,
};

const mockQueue = {
	add: async (...args: unknown[]) => {
		queueJobs.push(args);
	},
};

function makeService() {
	return createUploadsService({
		db: mockDb,
		uploadQueue: mockQueue,
		s3: mockS3,
	} as unknown as UploadsServiceDeps);
}

beforeEach(() => {
	selectResults.length = 0;
	insertResults.length = 0;
	updateCalls.length = 0;
	queueJobs.length = 0;
});

describe("uploads service", () => {
	describe("presignUpload", () => {
		it("returns presigned URL, file key, asset id and public URL", async () => {
			insertResults.push({ id: "asset-123" });
			const service = makeService();

			const result = await service.presignUpload({
				mimeType: "image/png",
				assetType: "image",
				size: 1024,
				userId: "usr_1",
			});

			expect(result.uploadUrl).toBe(
				"https://upload.example/images/123-abcd.jpg",
			);
			expect(result.fileKey).toBe("images/123-abcd.jpg");
			expect(result.assetId).toBe("asset-123");
			expect(result.publicUrl).toBe(
				"https://public.example/assets/asset-123.webp",
			);
			expect(updateCalls[0]?.storageUrl).toBe(
				"https://public.example/assets/asset-123.webp",
			);
		});

		it("rejects invalid mime types", async () => {
			const service = makeService();

			await expect(
				service.presignUpload({
					mimeType: "text/html" as never,
					userId: "usr_1",
				}),
			).rejects.toThrow("File type not allowed");
		});

		it("rejects files over 5MB", async () => {
			const service = makeService();

			await expect(
				service.presignUpload({
					mimeType: "image/png",
					size: 6 * 1024 * 1024,
					userId: "usr_1",
				}),
			).rejects.toThrow("File size exceeds 5MB limit");
		});

		it("rejects unknown asset types", async () => {
			const service = makeService();

			await expect(
				service.presignUpload({
					mimeType: "image/png",
					assetType: "video" as never,
					userId: "usr_1",
				}),
			).rejects.toThrow("Invalid asset type");
		});
	});

	describe("completeUpload", () => {
		it("moves uploading to uploaded and enqueues processing", async () => {
			selectResults.push({
				id: "asset-1",
				status: "uploading",
				storageUrl: "https://public.example/assets/asset-1.webp",
				mimeType: "image/png",
				ownerId: "usr_1",
			});
			const service = makeService();

			const result = await service.completeUpload({
				assetId: "asset-1",
				fileKey: "images/raw.png",
				userId: "usr_1",
			});

			expect(result.status).toBe("uploaded");
			expect(updateCalls[0]?.status).toBe("uploaded");
			expect(queueJobs).toHaveLength(1);
			expect(queueJobs[0]?.[0]).toBe("processUpload");
			expect(queueJobs[0]?.[2]).toMatchObject({
				jobId: "asset-1",
				attempts: 5,
			});
		});

		it("is idempotent for terminal/in-flight statuses", async () => {
			for (const status of [
				"ready",
				"failed",
				"processing",
				"uploaded",
			] as const) {
				selectResults.push({
					id: `asset-${status}`,
					status,
					storageUrl: "https://public.example/assets/asset.webp",
					mimeType: "image/png",
					ownerId: "usr_1",
				});
			}
			const service = makeService();

			for (const status of [
				"ready",
				"failed",
				"processing",
				"uploaded",
			] as const) {
				const result = await service.completeUpload({
					assetId: `asset-${status}`,
					fileKey: "images/raw.png",
					userId: "usr_1",
				});
				expect(result.status).toBe(status);
			}

			expect(updateCalls).toHaveLength(0);
			expect(queueJobs).toHaveLength(0);
		});

		it("throws when the asset is not found", async () => {
			const service = makeService();

			await expect(
				service.completeUpload({
					assetId: "asset-missing",
					fileKey: "images/raw.png",
					userId: "usr_1",
				}),
			).rejects.toThrow("Asset not found");
		});
	});

	describe("getAsset", () => {
		it("returns the owned asset", async () => {
			selectResults.push({
				id: "asset-1",
				status: "ready",
				storageUrl: "https://public.example/assets/asset-1.webp",
				mimeType: "image/webp",
				assetType: "image",
				ownerId: "usr_1",
			});
			const service = makeService();

			const result = await service.getAsset({
				assetId: "asset-1",
				userId: "usr_1",
			});

			expect(result).toEqual({
				assetId: "asset-1",
				status: "ready",
				storageUrl: "https://public.example/assets/asset-1.webp",
				mimeType: "image/webp",
				assetType: "image",
			});
		});

		it("throws when the asset is not found", async () => {
			const service = makeService();

			await expect(
				service.getAsset({ assetId: "asset-missing", userId: "usr_1" }),
			).rejects.toThrow("Asset not found");
		});
	});
});
