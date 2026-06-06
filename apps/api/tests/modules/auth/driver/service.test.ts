import { describe, expect, it } from "bun:test";
import {
	createDriverAuthService,
	type DriverSignUpInput,
} from "@api/modules/driver/auth/service";

const signupInput: DriverSignUpInput = {
	email: "driver@example.com",
	password: "password123",
	fullName: "Driver User",
	phoneNumber: "+255700000001",
	vehicleType: "motorcycle",
	licenseNumber: "LIC-12345",
};

const loginInput = {
	email: "driver@example.com",
	password: "password123",
};

function makeFullProfile(
	publicId: string,
	overrides?: Partial<{
		fullName: string;
		phoneNumber: string;
		avatarUrl: string | null;
		deliveryCount: number;
		ratingAverage: number;
		availability: string;
		status: string;
		currentLat: number | null;
		currentLng: number | null;
	}>,
) {
	return {
		id: `internal_${publicId}`,
		publicId,
		fullName: "Driver User",
		phoneNumber: "+255700000001",
		vehicleType: "motorcycle",
		licenseNumber: "LIC-12345",
		avatarUrl: null as string | null,
		deliveryCount: 0,
		ratingAverage: 0,
		availability: "offline",
		status: "pending",
		currentLat: null as number | null,
		currentLng: null as number | null,
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
				id: "usr_456",
				email: signupInput.email,
				name: signupInput.email,
				principalType: "driver",
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

describe("Driver auth service", () => {
	it("returns driver signup data and cookie header on success", async () => {
		const service = createDriverAuthService({
			authHandler: async () => makeAuthSuccessResponse(),
			createProfile: async () => ({
				id: "internal_drv_123",
				publicId: "drv_123",
			}),
			getProfileByUserId: async () => makeFullProfile("drv_123"),
		});

		const result = await service.signUp(
			signupInput,
			new Request("http://localhost/v1/app/driver/auth/sign-up"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.token).toBe("session-token");
		expect(result.data.setCookieHeader).toContain("better-auth.session=abc");
		expect(result.data.user.id).toBe("usr_456");
		expect(result.data.driver.id).toBe("drv_123");
	});

	it("maps better-auth signup failures to api errors", async () => {
		const service = createDriverAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(
					409,
					"USER_ALREADY_EXISTS",
					"User already exists",
				),
		});

		const result = await service.signUp(
			signupInput,
			new Request("http://localhost/v1/app/driver/auth/sign-up"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(409);
		expect(result.error.code).toBe("USER_ALREADY_EXISTS");
	});

	it("maps better-auth login failures to api errors", async () => {
		const service = createDriverAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(
					401,
					"INVALID_CREDENTIALS",
					"Invalid email or password",
				),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/driver/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(401);
		expect(result.error.code).toBe("INVALID_CREDENTIALS");
	});

	it("cleans up the auth user when driver profile persistence fails", async () => {
		const cleanedUserIds: string[] = [];
		const service = createDriverAuthService({
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
			new Request("http://localhost/v1/app/driver/auth/sign-up"),
		);

		expect(result.ok).toBe(false);
		expect(cleanedUserIds).toEqual(["usr_cleanup"]);
		if (result.ok) return;

		expect(result.error.status).toBe(500);
		expect(result.error.code).toBe("DRIVER_SIGNUP_FAILED");
	});

	it("returns driver login data and cookie header on success", async () => {
		const service = createDriverAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse(
					{ token: "session-token-login" },
					{
						"set-cookie": "better-auth.session=login-abc; Path=/; HttpOnly",
					},
				),
			getProfileByUserId: async () => makeFullProfile("drv_123"),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/driver/auth/login"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.token).toBe("session-token-login");
		expect(result.data.setCookieHeader).toContain(
			"better-auth.session=login-abc",
		);
		expect(result.data.user.id).toBe("usr_456");
		expect(result.data.driver.id).toBe("drv_123");
	});

	it("returns error if driver profile is missing on login", async () => {
		const service = createDriverAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse({
					user: {
						id: "usr_456",
						email: loginInput.email,
						name: loginInput.email,
						principalType: "driver",
					},
				}),
			getProfileByUserId: async () => null,
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/driver/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(403);
		expect(result.error.code).toBe("DRIVER_LOGIN_FAILED");
		expect(result.error.message).toBe("Driver profile was not found.");
	});

	it("rejects login for non-driver principals", async () => {
		const service = createDriverAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse({
					user: {
						id: "usr_456",
						email: loginInput.email,
						name: loginInput.email,
						principalType: "customer",
					},
				}),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/driver/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(403);
		expect(result.error.code).toBe("INVALID_PRINCIPAL_TYPE");
	});
});
