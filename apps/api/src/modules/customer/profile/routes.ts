import { fail, ok } from "@api/lib/http";
import { customerGuard } from "@api/plugins/guards/customer-guard";
import { Elysia, t } from "elysia";
import {
	type CustomerProfileService,
	createCustomerProfileService,
} from "./service";

const customerProfileSchema = t.Object({
	id: t.String(),
	fullName: t.String(),
	email: t.String(),
	phoneNumber: t.String(),
	avatarUrl: t.Union([t.String(), t.Null()]),
	status: t.String(),
	notificationPreferences: t.Object({
		pushEnabled: t.Boolean(),
		promotionalEnabled: t.Boolean(),
	}),
	lastActiveAt: t.String(),
	registeredAt: t.String(),
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
	data: customerProfileSchema,
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

const preferencesBody = t.Partial(
	t.Object({
		pushEnabled: t.Boolean(),
		promotionalEnabled: t.Boolean(),
	}),
);

export function createCustomerProfileRoutes(
	service: CustomerProfileService = createCustomerProfileService(),
) {
	return new Elysia({
		prefix: "/v1/app/customer",
		tags: ["customer-profile"],
		normalize: "typebox",
	})
		.use(customerGuard)
		.guard({ customerOnly: true }, (app) =>
			app
				.get(
					"/profile",
					async ({ customerSession, set }) => {
						if (!customerSession) {
							set.status = 403;
							return fail("FORBIDDEN", "Customers only route");
						}

						const result = await service.get(
							customerSession.customerId,
							customerSession.userId,
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
							tags: ["customer-profile"],
							summary: "Get customer profile",
						},
					},
				)
				.put(
					"/profile",
					async ({ body, customerSession, set }) => {
						if (!customerSession) {
							set.status = 403;
							return fail("FORBIDDEN", "Customers only route");
						}

						const result = await service.update(
							customerSession.customerId,
							customerSession.userId,
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
							tags: ["customer-profile"],
							summary: "Update customer profile",
						},
					},
				)
				.patch(
					"/profile/preferences",
					async ({ body, customerSession, set }) => {
						if (!customerSession) {
							set.status = 403;
							return fail("FORBIDDEN", "Customers only route");
						}

						const result = await service.updatePreferences(
							customerSession.customerId,
							customerSession.userId,
							body,
						);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok(result.data);
					},
					{
						body: preferencesBody,
						response: {
							200: successResponse,
							403: errorResponse,
							404: errorResponse,
						},
						detail: {
							tags: ["customer-profile"],
							summary: "Update notification preferences",
						},
					},
				)
				.get(
					"/me",
					async ({ customerSession, set }) => {
						if (!customerSession) {
							set.status = 403;
							return fail("FORBIDDEN", "Customers only route");
						}

						const result = await service.get(
							customerSession.customerId,
							customerSession.userId,
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
							tags: ["customer-profile"],
							summary: "Get current customer (alias)",
						},
					},
				),
		);
}
