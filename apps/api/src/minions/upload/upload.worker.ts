import type { db as Db } from "@api/db";
import { asset, auditLog } from "@api/db/schema";
import { generateId } from "@api/utils/id-generate";
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

	async function writeAudit(
		assetId: string,
		action: string,
		metadata?: Record<string, unknown>,
	) {
		await resolved.db.insert(auditLog).values({
			id: generateId(),
			actorType: "system" as never,
			actorId: "upload-worker",
			action,
			entityType: "asset",
			entityId: assetId,
			metadata: (metadata ?? null) as never,
		});
	}

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

		if (!existing || existing.status === "ready") return;

		const attempts = job.attemptsMade + 1;

		await db
			.update(asset)
			.set({
				status: "processing",
				processingStartedAt: new Date(),
				attempts,
				updatedAt: new Date(),
			})
			.where(eq(asset.id, assetId));

		await writeAudit(assetId, "asset.process_started", { attempts });

		const publicKey = s3.toPublicKey(assetId, mimeType);
		let finalMime = mimeType;
		let origWidth: number | null = null;
		let origHeight: number | null = null;
		let processedSize: number | null = null;

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
					const image = new Bun.Image(bytes);
					origWidth = image.width;
					origHeight = image.height;
					webpBytes = await image.webp({ quality: 80 }).bytes();
				} catch (e) {
					throw new PermanentProcessingError(
						e instanceof Error ? e.message : "Image transcode failed",
					);
				}
				await s3.publicS3.write(publicKey, webpBytes, {
					type: "image/webp",
				});
				finalMime = "image/webp";
				processedSize = webpBytes.byteLength;
			} else if (mimeType === "application/pdf") {
				const bytes = await s3.rawS3.file(fileKey).arrayBuffer();
				if (bytes.byteLength === 0) {
					throw new PermanentProcessingError("Empty PDF object in raw storage");
				}
				await s3.publicS3.write(publicKey, bytes, {
					type: "application/pdf",
				});
				processedSize = bytes.byteLength;
			} else {
				throw new PermanentProcessingError(
					`Unsupported mime type: ${mimeType}`,
				);
			}

			const compressionRatio =
				processedSize != null && existing.fileSize
					? Number((processedSize / existing.fileSize).toFixed(4))
					: null;

			await db
				.update(asset)
				.set({
					status: "ready",
					storageUrl: s3.buildPublicUrl(publicKey),
					mimeType: finalMime,
					origWidth,
					origHeight,
					processedSize,
					processingFinishedAt: new Date(),
					attempts,
					updatedAt: new Date(),
				})
				.where(eq(asset.id, assetId));

			await writeAudit(assetId, "asset.process_ready", {
				origWidth,
				origHeight,
				processedSize,
				compressionRatio,
			});

			try {
				await s3.rawS3.delete(fileKey);
			} catch {
				// non-fatal
			}
		} catch (e) {
			if (e instanceof PermanentProcessingError) {
				const error = e instanceof Error ? e.message : String(e);
				await db
					.update(asset)
					.set({
						status: "failed",
						processingError: error,
						processingFinishedAt: new Date(),
						attempts,
						updatedAt: new Date(),
					})
					.where(eq(asset.id, assetId));

				await writeAudit(assetId, "asset.process_failed", {
					error,
					attempts,
				});

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

		const error = err instanceof Error ? err.message : String(err);

		await resolved.db
			.update(asset)
			.set({
				status: "failed",
				processingError: error,
				processingFinishedAt: new Date(),
				attempts: job.attemptsMade,
				updatedAt: new Date(),
			})
			.where(eq(asset.id, job.data.assetId));

		await writeAudit(job.data.assetId, "asset.process_failed", {
			error,
			attempts: job.attemptsMade,
		});

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
