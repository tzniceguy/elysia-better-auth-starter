import { describe, expect, it } from "bun:test";
import {
	type StaffSignUpInput,
	createStaffAuthService,
} from "@api/modules/staff/auth/service";

const signupInput: StaffSignUpInput = {
	email: "staff@example.com",
	password: "password123",
	fullName: "Staff User",
	phoneNumber: "+255700000000",
};

const loginInput = {
	email: "staff@example.com",
	password: "password123",
};

function makeFullProfile(
	publicId: string,
	overrides?: Partial<{
		fullName: string;
		phoneNumber: string;
		avatarUrl: string | null;
		status: string;
		createdAt: Date;
		updatedAt: Date;
	}>,
) {
	return {
		id: `internal_${publicId}`,
		publicId,
		fullName: "Staff User",
		phoneNumber: "+255700000000",
		avatarUrl: null as string | null,
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function makeAuthSuccessResponse(
	overrides?: Record<string, unknown>,
	extraHeaders?: Record<string, string>,
) {
	return new Response(
		JSON.stringify({
			token: "session-token",
			user: {
				id: "usr_123",
				email: signupInput.email,
				name: signupInput.email,
				principalType: "staff",
			},
			...overrides,
		}),
		{
			status: 200,
			headers: {
				"content-type": "application/json",
				"set-cookie": "better-auth.session=abc; Path=/; HttpOnly",
				...extraHeaders,
			},
		},
	);
}

function makeAuthErrorResponse(status: number, code: string, message: string) {
	return new Response(JSON.stringify({ code, message }), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function makeSessionsResponse(
	sessions: Array<{
		id: string;
		token: string;
		createdAt: string;
		expiresAt: string;
		ipAddress?: string | null;
		userAgent?: string | null;
	}>,
) {
	return new Response(JSON.stringify(sessions), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

describe("Staff auth service", () => {
	it("returns staff signup data and cookie header on success", async () => {
		const service = createStaffAuthService({
			authHandler: async () => makeAuthSuccessResponse(),
			createProfile: async () => ({
				id: "internal_stf_123",
				publicId: "stf_123",
			}),
			getProfileByUserId: async () => makeFullProfile("stf_123"),
		});

		const result = await service.signUp(
			signupInput,
			new Request("http://localhost/v1/app/staff/auth/sign-up"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.token).toBe("session-token");
		expect(result.data.setCookieHeader).toContain("better-auth.session=abc");
		expect(result.data.user.id).toBe("usr_123");
		expect(result.data.staff.id).toBe("stf_123");
	});

	it("maps better-auth signup failures to api errors", async () => {
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(
					409,
					"USER_ALREADY_EXISTS",
					"User already exists",
				),
		});

		const result = await service.signUp(
			signupInput,
			new Request("http://localhost/v1/app/staff/auth/sign-up"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(409);
		expect(result.error.code).toBe("USER_ALREADY_EXISTS");
	});

	it("maps better-auth login failures to api errors", async () => {
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(
					401,
					"INVALID_CREDENTIALS",
					"Invalid email or password",
				),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/staff/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(401);
		expect(result.error.code).toBe("INVALID_CREDENTIALS");
	});

	it("cleans up the auth user when staff profile persistence fails", async () => {
		const cleanedUserIds: string[] = [];
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse({
					user: {
						id: "usr_cleanup",
						email: signupInput.email,
						name: signupInput.email,
					},
				}),
			createProfile: async () => null,
			cleanupUser: async (userId) => {
				cleanedUserIds.push(userId);
			},
		});

		const result = await service.signUp(
			signupInput,
			new Request("http://localhost/v1/app/staff/auth/sign-up"),
		);

		expect(result.ok).toBe(false);
		expect(cleanedUserIds).toEqual(["usr_cleanup"]);
		if (result.ok) return;

		expect(result.error.status).toBe(500);
		expect(result.error.code).toBe("STAFF_SIGNUP_FAILED");
	});

	it("returns staff login data and cookie header on success", async () => {
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse(
					{ token: "session-token-login" },
					{ "set-cookie": "better-auth.session=login-abc; Path=/; HttpOnly" },
				),
			getProfileByUserId: async () => makeFullProfile("stf_123"),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/staff/auth/login"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.token).toBe("session-token-login");
		expect(result.data.setCookieHeader).toContain("better-auth.session=login-abc");
		expect(result.data.user.id).toBe("usr_123");
		expect(result.data.staff.id).toBe("stf_123");
	});

	it("returns error if staff profile is missing on login", async () => {
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse({
					user: {
						id: "usr_123",
						email: loginInput.email,
						name: loginInput.email,
						principalType: "staff",
					},
				}),
			getProfileByUserId: async () => null,
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/staff/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(403);
		expect(result.error.code).toBe("STAFF_LOGIN_FAILED");
		expect(result.error.message).toBe("Staff profile was not found.");
	});

	it("rejects login for non-staff principals", async () => {
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse({
					user: {
						id: "usr_123",
						email: loginInput.email,
						name: loginInput.email,
						principalType: "merchant",
					},
				}),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/staff/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(403);
		expect(result.error.code).toBe("INVALID_PRINCIPAL_TYPE");
	});

	it("lists staff sessions with GET forwarding and null-safe fields", async () => {
		let forwardedRequest: Request | null = null;
		const service = createStaffAuthService({
			authHandler: async (request) => {
				forwardedRequest = request;
				return makeSessionsResponse([
					{
						id: "session_1",
						token: "token_1",
						createdAt: "2026-01-01T00:00:00.000Z",
						expiresAt: "2026-02-01T00:00:00.000Z",
						ipAddress: "127.0.0.1",
						userAgent: "Safari",
					},
					{
						id: "session_2",
						token: "token_2",
						createdAt: "2026-01-02T00:00:00.000Z",
						expiresAt: "2026-02-02T00:00:00.000Z",
					},
				]);
			},
		});

		const result = await service.listSessions(
			new Request("http://localhost/v1/app/staff/auth/sessions"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const forwarded = forwardedRequest as unknown as {
			method: string;
			url: string;
		};
		expect(forwarded.method).toBe("GET");
		expect(forwarded.url).toBe("http://localhost/api/auth/list-sessions");
		expect(result.data.sessions).toHaveLength(2);
		expect(result.data.sessions[0]?.token).toBe("token_1");
		expect(result.data.sessions[1]?.ipAddress).toBeNull();
		expect(result.data.sessions[1]?.userAgent).toBeNull();
	});

	it("maps list sessions failure to api errors", async () => {
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(401, "UNAUTHORIZED", "Unauthorized"),
		});

		const result = await service.listSessions(
			new Request("http://localhost/v1/app/staff/auth/sessions"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(401);
		expect(result.error.code).toBe("UNAUTHORIZED");
	});

	it("revokes a specific staff session by token", async () => {
		let forwardedRequest: Request | null = null;
		const service = createStaffAuthService({
			authHandler: async (request) => {
				forwardedRequest = request;
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		});

		const result = await service.revokeSession(
			new Request("http://localhost/v1/app/staff/auth/revoke-session"),
			"current-session-token",
			"target-session-token",
		);

		expect(result.ok).toBe(true);
		const forwarded = forwardedRequest as unknown as {
			method: string;
			url: string;
			json: () => Promise<{ token: string }>;
		};
		expect(forwarded.method).toBe("POST");
		expect(forwarded.url).toBe("http://localhost/api/auth/revoke-session");
		const payload = await forwarded.json();
		expect(payload.token).toBe("target-session-token");
	});

	it("maps revoke session failure to api errors", async () => {
		const service = createStaffAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(401, "UNAUTHORIZED", "Unauthorized"),
		});

		const result = await service.revokeSession(
			new Request("http://localhost/v1/app/staff/auth/revoke-session"),
			"current-session-token",
			"target-session-token",
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(401);
		expect(result.error.code).toBe("UNAUTHORIZED");
	});

	it("prevents revoking current staff session", async () => {
		let authHandlerCalls = 0;
		const service = createStaffAuthService({
			authHandler: async () => {
				authHandlerCalls += 1;
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		});

		const result = await service.revokeSession(
			new Request("http://localhost/v1/app/staff/auth/revoke-session"),
			"current-session-token",
			"current-session-token",
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(409);
		expect(result.error.code).toBe("CANNOT_REVOKE_CURRENT_SESSION");
		expect(authHandlerCalls).toBe(0);
	});
});
