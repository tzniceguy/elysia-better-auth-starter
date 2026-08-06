import type { db as Db } from "@api/db";
import { asset } from "@api/db/schema";
import type { bullMQConnection as BullMQConnection } from "@api/utils/que-factory";
import type * as s3Module from "@api/utils/s3";
import { type Job, Worker } from "bullmq";
import { eq } from "drizzle-orm";

export class PermanentProcessingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PermanentProcessingError";
	}
}

export interface UploadWorkerDeps {
	db: typeof Db;
	s3: Pick<
		typeof s3Module,
		"rawS3" | "publicS3" | "buildPublicUrl" | "toPublicKey"
	>;
	connection: typeof BullMQConnection;
}

export interface UploadWorker {
	worker: Worker;
	processUpload(job: Job): Promise<void>;
}

let cachedDeps: UploadWorkerDeps | null = null;

async function loadDeps(): Promise<UploadWorkerDeps> {
	if (cachedDeps) return cachedDeps;
	const [dbMod, s3, queueMod] = await Promise.all([
		import("@api/db"),
		import("@api/utils/s3"),
		import("@api/utils/que-factory"),
	]);
	cachedDeps = { db: dbMod.db, s3, connection: queueMod.bullMQConnection };
	return cachedDeps;
}

export async function createUploadWorker(
	deps: Partial<UploadWorkerDeps> = {},
): Promise<UploadWorker> {
	const resolved =
		deps.db && deps.s3 && deps.connection
			? (deps as UploadWorkerDeps)
			: await loadDeps();

	async function processUpload(job: Job) {
		const { db, s3 } = resolved;
		const { assetId, fileKey, mimeType } = job.data as {
			assetId: string;
			fileKey: string;
			mimeType: string;
		};

		const [existing] = await db
			.select()
			.from(asset)
			.where(eq(asset.id, assetId))
			.limit(1);

		if (existing?.status === "ready") return;

		await db
			.update(asset)
			.set({ status: "processing", updatedAt: new Date() })
			.where(eq(asset.id, assetId));

		const publicKey = s3.toPublicKey(assetId, mimeType);
		let finalMime = mimeType;

		try {
			if (mimeType.startsWith("image/")) {
				const bytes = await s3.rawS3.file(fileKey).arrayBuffer();
				if (bytes.byteLength === 0) {
					throw new PermanentProcessingError(
						"Empty image object in raw storage",
					);
				}
				let webpBytes: Uint8Array;
				try {
					webpBytes = await new Bun.Image(bytes).webp({ quality: 80 }).bytes();
				} catch (e) {
					throw new PermanentProcessingError(
						e instanceof Error ? e.message : "Image transcode failed",
					);
				}
				await s3.publicS3.write(publicKey, webpBytes, {
					type: "image/webp",
				});
				finalMime = "image/webp";
			} else if (mimeType === "application/pdf") {
				const bytes = await s3.rawS3.file(fileKey).arrayBuffer();
				if (bytes.byteLength === 0) {
					throw new PermanentProcessingError("Empty PDF object in raw storage");
				}
				await s3.publicS3.write(publicKey, bytes, {
					type: "application/pdf",
				});
			} else {
				throw new PermanentProcessingError(
					`Unsupported mime type: ${mimeType}`,
				);
			}

			await db
				.update(asset)
				.set({
					status: "ready",
					storageUrl: s3.buildPublicUrl(publicKey),
					mimeType: finalMime,
					updatedAt: new Date(),
				})
				.where(eq(asset.id, assetId));

			try {
				await s3.rawS3.delete(fileKey);
			} catch {
				// non-fatal
			}
		} catch (e) {
			if (e instanceof PermanentProcessingError) {
				await db
					.update(asset)
					.set({ status: "failed", updatedAt: new Date() })
					.where(eq(asset.id, assetId));
				try {
					await s3.rawS3.delete(fileKey);
				} catch {
					// ignore
				}
			}
			throw e;
		}
	}

	const worker = new Worker(
		"uploadQueue",
		async (job: Job) => {
			if (job.name === "processUpload") {
				await processUpload(job);
			}
		},
		{ connection: resolved.connection },
	);

	worker.on("completed", () => {});
	worker.on("failed", async (job, err) => {
		if (job?.name !== "processUpload") return;

		const maxAttempts = job.opts.attempts ?? 1;
		const isFinal =
			err instanceof PermanentProcessingError ||
			job.attemptsMade >= maxAttempts;

		if (!isFinal || !job.data.assetId) return;

		await resolved.db
			.update(asset)
			.set({ status: "failed", updatedAt: new Date() })
			.where(eq(asset.id, job.data.assetId));

		if (job.data.fileKey) {
			try {
				await resolved.s3.rawS3.delete(job.data.fileKey);
			} catch {
				// ignore
			}
		}
	});

	return { worker, processUpload };
}
