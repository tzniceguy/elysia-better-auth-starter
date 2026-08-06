import { fail, ok } from "@api/lib/http";
import { Elysia, t } from "elysia";
import { type CustomerAuthService, createCustomerAuthService } from "./service";

const signUpBody = t.Object({
	email: t.String(),
	password: t.String(),
	fullName: t.String(),
	phoneNumber: t.String(),
});

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
	data: t.Object({
		token: t.Union([t.String(), t.Null()]),
		user: userSchema,
		customer: customerProfileSchema,
	}),
	meta: metaSchema,
	error: t.Null(),
});

const errorResponse = t.Object({
	data: t.Null(),
	meta: metaSchema,
	error: errorSchema,
});

export function createCustomerAuthRoutes(
	service: CustomerAuthService = createCustomerAuthService(),
) {
	return new Elysia({
		prefix: "/v1/app/customer/auth",
		tags: ["customer-auth"],
		normalize: "typebox",
	})
		.post(
			"/sign-up",
			async ({ body, request, set }) => {
				const result = await service.signUp(body, request);

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
					customer: result.data.customer,
				});
			},
			{
				body: signUpBody,
				response: {
					200: successResponse,
					400: errorResponse,
					409: errorResponse,
					422: errorResponse,
					500: errorResponse,
				},
				detail: {
					tags: ["customer-auth"],
					summary: "Register a customer account",
				},
			},
		)
		.post(
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
					customer: result.data.customer,
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
					tags: ["customer-auth"],
					summary: "Customer login",
				},
			},
		);
}
