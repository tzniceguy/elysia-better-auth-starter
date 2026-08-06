import { fail, ok } from "@api/utils/response";
import { Elysia, t } from "elysia";
import { createStaffAuthService, type StaffAuthService } from "./service";

const signInBody = t.Object({
	email: t.String(),
	password: t.String(),
});

const userSchema = t.Object({
	id: t.String(),
	email: t.String(),
	name: t.String(),
	principalType: t.Union([t.String(), t.Null()]),
});

const staffProfileSchema = t.Object({
	id: t.String(),
	fullName: t.String(),
	email: t.String(),
	phoneNumber: t.String(),
	avatarUrl: t.Union([t.String(), t.Null()]),
	status: t.String(),
	createdAt: t.String(),
	updatedAt: t.String(),
});

const metaSchema = t.Object({
	requestId: t.Optional(t.String()),
});

const errorDetailSchema = t.Object({
	field: t.Optional(t.String()),
	message: t.String(),
});

const errorSchema = t.Object({
	code: t.String(),
	message: t.String(),
	details: t.Union([t.Array(errorDetailSchema), t.Null()]),
});

const successResponse = t.Object({
	data: t.Object({
		token: t.Union([t.String(), t.Null()]),
		user: userSchema,
		staff: staffProfileSchema,
	}),
	meta: metaSchema,
	error: t.Null(),
});

const errorResponse = t.Object({
	data: t.Null(),
	meta: metaSchema,
	error: errorSchema,
});

export function createStaffAuthRoutes(
	service: StaffAuthService = createStaffAuthService(),
) {
	return new Elysia({
		prefix: "/v1/app/staff/auth",
		tags: ["staff-auth"],
		normalize: "typebox",
	}).post(
		"/login",
		async ({ body, request, set }) => {
			const result = await service.login(body, request);

			if (!result.ok) {
				set.status = result.error.status;
				return fail(result.error.code, result.error.message);
			}

			if (result.data.setCookieHeader) {
				set.headers["set-cookie"] = result.data.setCookieHeader;
			}

			return ok({
				token: result.data.token,
				user: result.data.user,
				staff: result.data.staff,
			});
		},
		{
			body: signInBody,
			response: {
				200: successResponse,
				400: errorResponse,
				401: errorResponse,
				403: errorResponse,
			},
			detail: {
				tags: ["staff-auth"],
				summary: "Staff login",
			},
		},
	);
}
