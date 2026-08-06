import { fail, ok } from "@api/lib/http";
import { staffGuard } from "@api/plugins/guards/staff-guard";
import { Elysia, t } from "elysia";
import { createStaffProfileService, type StaffProfileService } from "./service";

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
	data: staffProfileSchema,
	meta: metaSchema,
	error: t.Null(),
});

const errorResponse = t.Object({
	data: t.Null(),
	meta: metaSchema,
	error: errorSchema,
});

const updateProfileBody = t.Partial(
	t.Object({
		fullName: t.String(),
		phoneNumber: t.String(),
		avatarUrl: t.Union([t.String(), t.Null()]),
	}),
);

export function createStaffProfileRoutes(
	service: StaffProfileService = createStaffProfileService(),
) {
	return new Elysia({
		prefix: "/v1/app/staff",
		tags: ["staff-profile"],
		normalize: "typebox",
	})
		.use(staffGuard)
		.guard({ staffOnly: true }, (app) =>
			app
				.get(
					"/profile",
					async ({ staffSession, set }) => {
						if (!staffSession) {
							set.status = 403;
							return fail("FORBIDDEN", "Staff only route");
						}

						const result = await service.get(
							staffSession.staffId,
							staffSession.userId,
						);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok(result.data);
					},
					{
						response: {
							200: successResponse,
							403: errorResponse,
							404: errorResponse,
						},
						detail: {
							tags: ["staff-profile"],
							summary: "Get staff profile",
						},
					},
				)
				.put(
					"/profile",
					async ({ body, staffSession, set }) => {
						if (!staffSession) {
							set.status = 403;
							return fail("FORBIDDEN", "Staff only route");
						}

						const result = await service.update(
							staffSession.staffId,
							staffSession.userId,
							body,
						);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok(result.data);
					},
					{
						body: updateProfileBody,
						response: {
							200: successResponse,
							403: errorResponse,
							404: errorResponse,
							500: errorResponse,
						},
						detail: {
							tags: ["staff-profile"],
							summary: "Update staff profile",
						},
					},
				),
		);
}
