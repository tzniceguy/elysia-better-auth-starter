import type { TSchema } from "@sinclair/typebox";
import { t } from "elysia";

export const metaSchema = t.Object({
	requestId: t.Optional(t.String()),
});

export const errorDetailSchema = t.Object({
	field: t.Optional(t.String()),
	message: t.String(),
});

export const errorSchema = t.Object({
	code: t.String(),
	message: t.String(),
	details: t.Union([t.Array(errorDetailSchema), t.Null()]),
});

export const errorResponse = t.Object({
	data: t.Null(),
	meta: metaSchema,
	error: errorSchema,
});

export function successSchema<T extends TSchema>(data: T) {
	return t.Object({
		data,
		meta: metaSchema,
		error: t.Null(),
	});
}
