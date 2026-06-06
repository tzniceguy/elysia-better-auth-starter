import { fail, ok } from "@api/utils/response";
import { Elysia, t } from "elysia";
import { createDriverAuthService, type DriverAuthService } from "./service";

const signUpBody = t.Object({
	email: t.String(),
	password: t.String(),
	fullName: t.String(),
	phoneNumber: t.String(),
	vehicleType: t.String(),
	licenseNumber: t.String(),
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

const driverProfileSchema = t.Object({
	id: t.String(),
	fullName: t.String(),
	email: t.String(),
	phoneNumber: t.String(),
	vehicleType: t.String(),
	licenseNumber: t.String(),
	avatarUrl: t.Union([t.String(), t.Null()]),
	deliveryCount: t.Number(),
	ratingAverage: t.Number(),
	availability: t.String(),
	status: t.String(),
	currentLat: t.Union([t.Number(), t.Null()]),
	currentLng: t.Union([t.Number(), t.Null()]),
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
		driver: driverProfileSchema,
	}),
	meta: metaSchema,
	error: t.Null(),
});

const errorResponse = t.Object({
	data: t.Null(),
	meta: metaSchema,
	error: errorSchema,
});

export function createDriverAuthRoutes(
	service: DriverAuthService = createDriverAuthService(),
) {
	return new Elysia({
		prefix: "/v1/app/driver/auth",
		tags: ["driver-auth"],
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
					driver: result.data.driver,
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
					tags: ["driver-auth"],
					summary: "Register a driver account",
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
					driver: result.data.driver,
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
					tags: ["driver-auth"],
					summary: "Driver login",
				},
			},
		);
}
