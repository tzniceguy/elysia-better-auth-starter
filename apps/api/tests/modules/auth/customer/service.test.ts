import { describe, expect, it } from "bun:test";
import {
	type CustomerSignUpInput,
	createCustomerAuthService,
} from "@api/modules/customer/auth/service";

const signupInput: CustomerSignUpInput = {
	email: "customer@example.com",
	password: "password123",
	fullName: "Customer User",
	phoneNumber: "+255700000000",
};

const loginInput = {
	email: "customer@example.com",
	password: "password123",
};

function makeFullProfile(
	publicId: string,
	overrides?: Partial<{
		fullName: string;
		phoneNumber: string;
		avatarUrl: string | null;
		totalRides: number;
		status: string;
		pushEnabled: boolean;
		promotionalEnabled: boolean;
		lastActiveAt: Date;
		registeredAt: Date;
	}>,
) {
	return {
		id: `internal_${publicId}`,
		publicId,
		fullName: "Customer User",
		phoneNumber: "+255700000000",
		avatarUrl: null as string | null,
		totalRides: 0,
		status: "active",
		pushEnabled: true,
		promotionalEnabled: false,
		lastActiveAt: new Date(),
		registeredAt: new Date(),
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
				principalType: "customer",
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

describe("Customer auth service", () => {
	it("returns customer signup data and cookie header on success", async () => {
		const service = createCustomerAuthService({
			authHandler: async () => makeAuthSuccessResponse(),
			createProfile: async () => ({
				id: "internal_cus_123",
				publicId: "cus_123",
			}),
			getProfileByUserId: async () => makeFullProfile("cus_123"),
		});

		const result = await service.signUp(
			signupInput,
			new Request("http://localhost/v1/app/customer/auth/sign-up"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.token).toBe("session-token");
		expect(result.data.setCookieHeader).toContain("better-auth.session=abc");
		expect(result.data.user.id).toBe("usr_123");
		expect(result.data.customer.id).toBe("cus_123");
	});

	it("maps better-auth signup failures to api errors", async () => {
		const service = createCustomerAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(
					409,
					"USER_ALREADY_EXISTS",
					"User already exists",
				),
		});

		const result = await service.signUp(
			signupInput,
			new Request("http://localhost/v1/app/customer/auth/sign-up"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(409);
		expect(result.error.code).toBe("USER_ALREADY_EXISTS");
	});

	it("maps better-auth login failures to api errors", async () => {
		const service = createCustomerAuthService({
			authHandler: async () =>
				makeAuthErrorResponse(
					401,
					"INVALID_CREDENTIALS",
					"Invalid email or password",
				),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/customer/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(401);
		expect(result.error.code).toBe("INVALID_CREDENTIALS");
	});

	it("cleans up the auth user when customer profile persistence fails", async () => {
		const cleanedUserIds: string[] = [];
		const service = createCustomerAuthService({
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
			new Request("http://localhost/v1/app/customer/auth/sign-up"),
		);

		expect(result.ok).toBe(false);
		expect(cleanedUserIds).toEqual(["usr_cleanup"]);
		if (result.ok) return;

		expect(result.error.status).toBe(500);
		expect(result.error.code).toBe("CUSTOMER_SIGNUP_FAILED");
	});

	it("returns customer login data and cookie header on success", async () => {
		const service = createCustomerAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse(
					{ token: "session-token-login" },
					{ "set-cookie": "better-auth.session=login-abc; Path=/; HttpOnly" },
				),
			getProfileByUserId: async () => makeFullProfile("cus_123"),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/customer/auth/login"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.token).toBe("session-token-login");
		expect(result.data.setCookieHeader).toContain(
			"better-auth.session=login-abc",
		);
		expect(result.data.user.id).toBe("usr_123");
		expect(result.data.customer.id).toBe("cus_123");
	});

	it("returns error if customer profile is missing on login", async () => {
		const service = createCustomerAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse({
					user: {
						id: "usr_123",
						email: loginInput.email,
						name: loginInput.email,
						principalType: "customer",
					},
				}),
			getProfileByUserId: async () => null,
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/customer/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(403);
		expect(result.error.code).toBe("CUSTOMER_LOGIN_FAILED");
		expect(result.error.message).toBe("Customer profile was not found.");
	});

	it("rejects login for non-customer principals", async () => {
		const service = createCustomerAuthService({
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
			new Request("http://localhost/v1/app/customer/auth/login"),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error.status).toBe(403);
		expect(result.error.code).toBe("INVALID_PRINCIPAL_TYPE");
	});

	it("accepts legacy consumer principals on customer login", async () => {
		const service = createCustomerAuthService({
			authHandler: async () =>
				makeAuthSuccessResponse(
					{
						user: {
							id: "usr_123",
							email: loginInput.email,
							name: loginInput.email,
							principalType: "consumer",
						},
					},
					{
						"set-cookie":
							"better-auth.session=legacy-customer; Path=/; HttpOnly",
					},
				),
			getProfileByUserId: async () => makeFullProfile("cust_123"),
		});

		const result = await service.login(
			loginInput,
			new Request("http://localhost/v1/app/customer/auth/login"),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.data.user.principalType).toBe("customer");
		expect(result.data.customer.id).toBe("cust_123");
	});
});
