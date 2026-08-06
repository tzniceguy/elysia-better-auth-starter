import type { db as Db } from "@api/db";

import { asset } from "@api/db/schema";
import type { uploadQueue as UploadQueue } from "@api/queues/upload/upload.queue";
import type * as s3Module from "@api/utils/s3";
import { and, eq } from "drizzle-orm";

export type AssetType = "document" | "image";
export type AssetStatus =
	| "uploading"
	| "uploaded"
	| "processing"
	| "ready"
	| "failed";

export interface PresignInput {
	mimeType: s3Module.AllowedMimeType;
	assetType?: AssetType;
	size?: number;
	userId: string;
}
export interface PresignResult {
	uploadUrl: string;
	fileKey: string;
	assetId: string;
	publicUrl: string;
}
export interface CompleteInput {
	assetId: string;
	fileKey: string;
	userId: string;
}
export interface CompleteResult {
	assetId: string;
	status: AssetStatus;
	storageUrl: string;
	mimeType: string | null;
}
export interface GetAssetInput {
	assetId: string;
	userId: string;
}
export interface GetAssetResult {
	assetId: string;
	status: AssetStatus;
	storageUrl: string;
	mimeType: string | null;
	assetType: string;
}

export interface UploadsService {
	presignUpload(input: PresignInput): Promise<PresignResult>;
	completeUpload(input: CompleteInput): Promise<CompleteResult>;
	getAsset(input: GetAssetInput): Promise<GetAssetResult>;
}

export interface UploadsServiceDeps {
	db: typeof Db;
	uploadQueue: typeof UploadQueue;
	s3: Pick<
		typeof s3Module,
		| "validateFile"
		| "generateRawKey"
		| "buildPublicUrl"
		| "toPublicKey"
		| "rawS3"
	>;
}

const ASSET_TYPES = ["document", "image"] as const;

const TERMINAL_OR_IN_FLIGHT: AssetStatus[] = [
	"uploaded",
	"processing",
	"ready",
	"failed",
];

let cachedDeps: UploadsServiceDeps | null = null;

async function loadDeps(): Promise<UploadsServiceDeps> {
	if (cachedDeps) return cachedDeps;
	const [dbMod, queueMod, s3] = await Promise.all([
		import("@api/db"),
		import("@api/queues/upload/upload.queue"),
		import("@api/utils/s3"),
	]);
	cachedDeps = { db: dbMod.db, uploadQueue: queueMod.uploadQueue, s3 };
	return cachedDeps;
}

export function createUploadsService(
	deps: Partial<UploadsServiceDeps> = {},
): UploadsService {
	const resolved =
		deps.db && deps.uploadQueue && deps.s3
			? (deps as UploadsServiceDeps)
			: null;

	async function getDeps(): Promise<UploadsServiceDeps> {
		return resolved ?? (await loadDeps());
	}

	async function presignUpload(input: PresignInput): Promise<PresignResult> {
		const { db, s3 } = await getDeps();

		const { valid, error } = s3.validateFile({
			mimeType: input.mimeType,
			size: input.size ?? 0,
		});
		if (!valid) throw new Error(error);

		const assetType = input.assetType ?? "document";
		if (!ASSET_TYPES.includes(assetType)) {
			throw new Error(`Invalid asset type. Allowed: ${ASSET_TYPES.join(", ")}`);
		}

		const fileKey = s3.generateRawKey(input.mimeType);

		const [assetRecord] = await db
			.insert(asset)
			.values({
				assetType,
				ownerId: input.userId,
				storageUrl: "",
				mimeType: input.mimeType,
				fileSize: input.size,
				status: "uploading",
			})
			.returning({ id: asset.id });

		if (!assetRecord) throw new Error("Failed to create asset record");

		const publicUrl = s3.buildPublicUrl(
			s3.toPublicKey(assetRecord.id, input.mimeType),
		);

		await db
			.update(asset)
			.set({ storageUrl: publicUrl, updatedAt: new Date() })
			.where(eq(asset.id, assetRecord.id));

		const uploadUrl = s3.rawS3.presign(fileKey, {
			method: "PUT",
			expiresIn: 3600,
			type: input.mimeType,
		});

		return { uploadUrl, fileKey, assetId: assetRecord.id, publicUrl };
	}

	async function completeUpload(input: CompleteInput): Promise<CompleteResult> {
		const { db, uploadQueue } = await getDeps();

		const [record] = await db
			.select()
			.from(asset)
			.where(and(eq(asset.id, input.assetId), eq(asset.ownerId, input.userId)))
			.limit(1);

		if (!record) throw new Error("Asset not found");

		const status = record.status as AssetStatus;

		if (TERMINAL_OR_IN_FLIGHT.includes(status)) {
			return {
				assetId: record.id,
				status,
				storageUrl: record.storageUrl,
				mimeType: record.mimeType,
			};
		}

		if (status !== "uploading") {
			throw new Error(`Asset cannot be completed from status: ${status}`);
		}

		await db
			.update(asset)
			.set({ status: "uploaded", updatedAt: new Date() })
			.where(eq(asset.id, input.assetId));

		await uploadQueue.add(
			"processUpload",
			{
				assetId: input.assetId,
				fileKey: input.fileKey,
				mimeType: record.mimeType ?? "application/octet-stream",
			},
			{
				jobId: input.assetId,
				attempts: 5,
				backoff: { type: "exponential", delay: 2000 },
			},
		);

		return {
			assetId: input.assetId,
			status: "uploaded",
			storageUrl: record.storageUrl,
			mimeType: record.mimeType,
		};
	}

	async function getAsset(input: GetAssetInput): Promise<GetAssetResult> {
		const { db } = await getDeps();

		const [record] = await db
			.select()
			.from(asset)
			.where(and(eq(asset.id, input.assetId), eq(asset.ownerId, input.userId)))
			.limit(1);

		if (!record) throw new Error("Asset not found");

		return {
			assetId: record.id,
			status: record.status as AssetStatus,
			storageUrl: record.storageUrl,
			mimeType: record.mimeType,
			assetType: record.assetType,
		};
	}

	return { presignUpload, completeUpload, getAsset };
}

export type UploadsServiceType = ReturnType<typeof createUploadsService>;
