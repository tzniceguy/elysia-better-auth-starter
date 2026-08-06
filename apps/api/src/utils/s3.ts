import { env } from "@api/env";
import { S3Client } from "bun";
import { nanoid } from "nanoid";

export const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/avif",
	"application/pdf",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE = 5 * 1024 * 1024;

const sharedCreds = {
	accessKeyId: env.STORAGE_ACCESS_KEY_ID,
	secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
	endpoint: env.STORAGE_ENDPOINT,
	region: env.STORAGE_REGION,
};

export const rawS3 = new S3Client({
	...sharedCreds,
	bucket: env.STORAGE_RAW_BUCKET,
});
export const publicS3 = new S3Client({
	...sharedCreds,
	bucket: env.STORAGE_PUBLIC_BUCKET,
});

export function buildPublicUrl(fileKey: string): string {
	return `${env.STORAGE_PUBLIC_URL.replace(/\/$/, "")}/${fileKey}`;
}

export function toPublicKey(assetId: string, mimeType: string): string {
	if (mimeType.startsWith("image/")) return `assets/${assetId}.webp`;
	return `assets/${assetId}.pdf`;
}

export function generateRawKey(mimeType: AllowedMimeType): string {
	const timestamp = Date.now();
	const randomId = nanoid();
	const EXTENSION_MAP: Record<AllowedMimeType, string> = {
		"image/jpeg": ".jpg",
		"image/png": ".png",
		"image/webp": ".webp",
		"image/gif": ".gif",
		"image/avif": ".avif",
		"application/pdf": ".pdf",
	};
	const extension = EXTENSION_MAP[mimeType];
	const folder = mimeType.startsWith("image/") ? "images" : "documents";
	return `${folder}/${timestamp}-${randomId}${extension}`;
}

export function validateFile(file: { size: number; mimeType: string }): {
	valid: boolean;
	error?: string;
} {
	if (!ALLOWED_MIME_TYPES.includes(file.mimeType as AllowedMimeType)) {
		return {
			valid: false,
			error: `File type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
		};
	}
	if (file.size > MAX_FILE_SIZE) {
		return {
			valid: false,
			error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
		};
	}
	return { valid: true };
}
