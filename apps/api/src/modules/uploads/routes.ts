import { fail, ok } from "@api/lib/http";
import { errorResponse, successSchema } from "@api/lib/response-schema";
import { authPlugin } from "@api/plugins/auth";
import { Elysia, t } from "elysia";
import { createUploadsService, type UploadsServiceType } from "./service";

const mimeTypeSchema = t.Union([
	t.Literal("image/jpeg"),
	t.Literal("image/png"),
	t.Literal("image/webp"),
	t.Literal("image/gif"),
	t.Literal("image/avif"),
	t.Literal("application/pdf"),
]);
const assetTypeSchema = t.Union([t.Literal("document"), t.Literal("image")]);
const assetStatusSchema = t.Union([
	t.Literal("uploading"),
	t.Literal("uploaded"),
	t.Literal("processing"),
	t.Literal("ready"),
	t.Literal("failed"),
]);

const presignResponse = successSchema(
	t.Object({
		uploadUrl: t.String(),
		fileKey: t.String(),
		assetId: t.String(),
		publicUrl: t.String(),
	}),
);
const assetStateResponse = successSchema(
	t.Object({
		assetId: t.String(),
		status: assetStatusSchema,
		storageUrl: t.String(),
		mimeType: t.Union([t.String(), t.Null()]),
		processedSize: t.Optional(t.Union([t.Integer(), t.Null()])),
		origWidth: t.Optional(t.Union([t.Integer(), t.Null()])),
		origHeight: t.Optional(t.Union([t.Integer(), t.Null()])),
		processingStartedAt: t.Optional(
			t.Union([t.String({ format: "date-time" }), t.Null()]),
		),
		processingFinishedAt: t.Optional(
			t.Union([t.String({ format: "date-time" }), t.Null()]),
		),
		processingError: t.Optional(t.Union([t.String(), t.Null()])),
		attempts: t.Optional(t.Integer()),
	}),
);
const getAssetResponse = successSchema(
	t.Object({
		assetId: t.String(),
		status: assetStatusSchema,
		storageUrl: t.String(),
		mimeType: t.Union([t.String(), t.Null()]),
		assetType: t.String(),
		rawKey: t.Optional(t.Union([t.String(), t.Null()])),
		fileSize: t.Optional(t.Union([t.Integer(), t.Null()])),
		processedSize: t.Optional(t.Union([t.Integer(), t.Null()])),
		origWidth: t.Optional(t.Union([t.Integer(), t.Null()])),
		origHeight: t.Optional(t.Union([t.Integer(), t.Null()])),
		processingStartedAt: t.Optional(
			t.Union([t.String({ format: "date-time" }), t.Null()]),
		),
		processingFinishedAt: t.Optional(
			t.Union([t.String({ format: "date-time" }), t.Null()]),
		),
		processingError: t.Optional(t.Union([t.String(), t.Null()])),
		attempts: t.Optional(t.Integer()),
	}),
);

export function createUploadRoutes(
	service: UploadsServiceType = createUploadsService(),
) {
	return new Elysia({
		prefix: "/v1/app/uploads",
		tags: ["uploads"],
		normalize: "typebox",
	})
		.use(authPlugin)
		.post(
			"/presign",
			async ({ body, user, set }) => {
				if (!user) {
					set.status = 401;
					return fail("UNAUTHORIZED", "Unauthorized");
				}
				try {
					const result = await service.presignUpload({
						mimeType: body.mimeType,
						assetType: body.assetType,
						size: body.size,
						userId: user.id,
					});
					return ok(result);
				} catch (e) {
					set.status = 400;
					return fail(
						"PRESIGN_FAILED",
						e instanceof Error ? e.message : "Failed to generate presigned URL",
					);
				}
			},
			{
				authenticated: true,
				body: t.Object({
					mimeType: mimeTypeSchema,
					assetType: t.Optional(assetTypeSchema),
					size: t.Optional(t.Number({ minimum: 1 })),
				}),
				response: {
					200: presignResponse,
					400: errorResponse,
					401: errorResponse,
					500: errorResponse,
				},
				detail: { summary: "Get a presigned upload URL", tags: ["uploads"] },
			},
		)
		.post(
			"/complete",
			async ({ body, user, set }) => {
				if (!user) {
					set.status = 401;
					return fail("UNAUTHORIZED", "Unauthorized");
				}
				try {
					const result = await service.completeUpload({
						assetId: body.assetId,
						fileKey: body.fileKey,
						userId: user.id,
					});
					return ok(result);
				} catch (e) {
					const message =
						e instanceof Error ? e.message : "Failed to complete upload";
					const notFound = message === "Asset not found";
					set.status = notFound ? 404 : 400;
					return fail(notFound ? "NOT_FOUND" : "COMPLETE_FAILED", message);
				}
			},
			{
				authenticated: true,
				body: t.Object({
					assetId: t.String({ format: "uuid" }),
					fileKey: t.String({ minLength: 1 }),
				}),
				response: {
					200: assetStateResponse,
					400: errorResponse,
					401: errorResponse,
					404: errorResponse,
					500: errorResponse,
				},
				detail: {
					summary: "Confirm upload finalised and start post-processing",
					tags: ["uploads"],
				},
			},
		)
		.get(
			"/:assetId",
			async ({ params, user, set }) => {
				if (!user) {
					set.status = 401;
					return fail("UNAUTHORIZED", "Unauthorized");
				}
				try {
					const result = await service.getAsset({
						assetId: params.assetId,
						userId: user.id,
					});
					return ok(result);
				} catch (e) {
					const message =
						e instanceof Error ? e.message : "Failed to get asset";
					const notFound = message === "Asset not found";
					set.status = notFound ? 404 : 400;
					return fail(notFound ? "NOT_FOUND" : "GET_ASSET_FAILED", message);
				}
			},
			{
				authenticated: true,
				params: t.Object({ assetId: t.String({ format: "uuid" }) }),
				response: {
					200: getAssetResponse,
					400: errorResponse,
					401: errorResponse,
					404: errorResponse,
					500: errorResponse,
				},
				detail: { summary: "Get asset status by id", tags: ["uploads"] },
			},
		);
}
