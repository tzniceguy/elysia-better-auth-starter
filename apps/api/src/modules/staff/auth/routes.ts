import { fail, ok } from "@api/lib/http";
import { staffGuard } from "@api/plugins/guards/staff-guard";
import auth from "@api/utils/auth";
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

const sessionSchema = t.Object({
	id: t.String(),
	token: t.String(),
	createdAt: t.String(),
	expiresAt: t.String(),
	ipAddress: t.Union([t.String(), t.Null()]),
	userAgent: t.Union([t.String(), t.Null()]),
});

const listSessionsResponse = t.Object({
	data: t.Object({
		sessions: t.Array(sessionSchema),
	}),
	meta: metaSchema,
	error: t.Null(),
});

const successStatusResponse = t.Object({
	data: t.Object({ success: t.Literal(true) }),
	meta: metaSchema,
	error: t.Null(),
});

const revokeSessionBody = t.Object({
	token: t.String(),
});

const forgetPasswordBody = t.Object({
	email: t.String(),
	redirectTo: t.Optional(t.String()),
});

const resetPasswordBody = t.Object({
	token: t.String(),
	newPassword: t.String(),
});

const resendVerificationBody = t.Object({
	email: t.String(),
});

const changePasswordBody = t.Object({
	currentPassword: t.String(),
	newPassword: t.String(),
});

interface AuthSessionResponse {
	session?: {
		token?: string | null;
	} | null;
}

const authApi = auth.api as unknown as {
	getSession: (input: {
		headers: Headers;
	}) => Promise<AuthSessionResponse | null>;
};

export function createStaffAuthRoutes(
	service: StaffAuthService = createStaffAuthService(),
) {
	return new Elysia({
		prefix: "/v1/app/staff/auth",
		tags: ["staff-auth"],
		normalize: "typebox",
	})
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
		)
		.post(
			"/forget-password",
			async ({ body, request, set }) => {
				const result = await service.forgetPassword(body, request);
				if (!result.ok) {
					set.status = result.error.status;
					return fail(result.error.code, result.error.message);
				}
				return ok({ success: true as const });
			},
			{
				body: forgetPasswordBody,
				response: { 200: successStatusResponse, 400: errorResponse },
				detail: { tags: ["staff-auth"], summary: "Request staff password reset" },
			},
		)
		.post(
			"/reset-password",
			async ({ body, request, set }) => {
				const result = await service.resetPassword(body, request);
				if (!result.ok) {
					set.status = result.error.status;
					return fail(result.error.code, result.error.message);
				}
				return ok({ success: true as const });
			},
			{
				body: resetPasswordBody,
				response: { 200: successStatusResponse, 400: errorResponse },
				detail: { tags: ["staff-auth"], summary: "Reset staff password" },
			},
		)
		.post(
			"/resend-verification",
			async ({ body, request, set }) => {
				const result = await service.resendVerification(body, request);
				if (!result.ok) {
					set.status = result.error.status;
					return fail(result.error.code, result.error.message);
				}
				return ok({ success: true as const });
			},
			{
				body: resendVerificationBody,
				response: { 200: successStatusResponse, 400: errorResponse },
				detail: { tags: ["staff-auth"], summary: "Resend staff verification" },
			},
		)
		.use(staffGuard)
		.guard({ staffOnly: true }, (app) =>
			app
				.post(
					"/logout",
					async ({ request, set }) => {
						const result = await service.logout(request);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok({ success: true as const });
					},
					{
						response: {
							200: successStatusResponse,
							401: errorResponse,
						},
						detail: {
							tags: ["staff-auth"],
							summary: "Logout current staff session",
						},
					},
				)
				.post(
					"/revoke-sessions",
					async ({ request, set }) => {
						const result = await service.revokeSessions(request);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok({ success: true as const });
					},
					{
						response: {
							200: successStatusResponse,
							401: errorResponse,
						},
						detail: {
							tags: ["staff-auth"],
							summary: "Revoke all staff sessions",
						},
					},
				)
				.get(
					"/sessions",
					async ({ request, set }) => {
						const result = await service.listSessions(request);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok({ sessions: result.data.sessions });
					},
					{
						response: {
							200: listSessionsResponse,
							401: errorResponse,
						},
						detail: {
							tags: ["staff-auth"],
							summary: "List active staff sessions",
						},
					},
				)
				.post(
					"/change-password",
					async ({ body, request, set }) => {
						const result = await service.changePassword(body, request);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok({ success: true as const });
					},
					{
						body: changePasswordBody,
						response: {
							200: successStatusResponse,
							401: errorResponse,
							400: errorResponse,
						},
						detail: {
							tags: ["staff-auth"],
							summary: "Change staff password",
						},
					},
				)
				.post(
					"/revoke-session",
					async ({ body, request, set }) => {
						const session = await authApi.getSession({
							headers: request.headers,
						});
						const currentSessionToken = session?.session?.token;
						if (!currentSessionToken) {
							set.status = 401;
							return fail("UNAUTHORIZED", "Unauthorized");
						}

						const result = await service.revokeSession(
							request,
							currentSessionToken,
							body.token,
						);
						if (!result.ok) {
							set.status = result.error.status;
							return fail(result.error.code, result.error.message);
						}
						return ok({ success: true as const });
					},
					{
						body: revokeSessionBody,
						response: {
							200: successStatusResponse,
							401: errorResponse,
							409: errorResponse,
						},
						detail: {
							tags: ["staff-auth"],
							summary: "Revoke a single staff session",
						},
					},
				),
		);
}
