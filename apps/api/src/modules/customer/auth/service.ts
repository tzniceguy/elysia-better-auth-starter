import { db } from "@api/db";
import { customer } from "@api/db/schema";
import auth from "@api/utils/auth";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export interface CustomerSignUpInput {
	email: string;
	password: string;
	fullName: string;
	phoneNumber: string;
}

export interface CustomerSignInInput {
	email: string;
	password: string;
}

export interface CustomerProfileData {
	id: string;
	fullName: string;
	email: string;
	phoneNumber: string;
	avatarUrl: string | null;
	totalRides: number;
	status: string;
	notificationPreferences: {
		pushEnabled: boolean;
		promotionalEnabled: boolean;
	};
	lastActiveAt: string;
	registeredAt: string;
}

export type CustomerAuthResult =
	| {
			ok: true;
			data: {
				token: string | null;
				user: {
					id: string;
					email: string;
					name: string;
					principalType: string | null;
				};
				customer: CustomerProfileData;
				setCookieHeader: string | null;
			};
	  }
	| {
			ok: false;
			error: {
				status: number;
				code: string;
				message: string;
			};
	  };

export interface CustomerAuthServiceDeps {
	authHandler?: (request: Request) => Promise<Response>;
	createProfile?: (data: {
		userId: string;
		fullName: string;
		phoneNumber: string;
	}) => Promise<{
		id: string;
		publicId: string;
	} | null>;
	getProfileByUserId?: (userId: string) => Promise<{
		id: string;
		publicId: string;
		fullName: string;
		phoneNumber: string;
		avatarUrl: string | null;
		totalRides: number;
		status: string;
		pushEnabled: boolean;
		promotionalEnabled: boolean;
		lastActiveAt: Date;
		registeredAt: Date;
	} | null>;
	cleanupUser?: (userId: string) => Promise<void>;
}

function buildForwardedRequest(
	path: string,
	input: Record<string, unknown>,
	request: Request,
): Request {
	const url = new URL(path, request.url);
	const headers = new Headers({
		"content-type": "application/json",
	});

	for (const key of [
		"cookie",
		"origin",
		"user-agent",
		"x-forwarded-for",
		"x-forwarded-host",
		"x-forwarded-proto",
	] as const) {
		const value = request.headers.get(key);
		if (value) headers.set(key, value);
	}

	return new Request(url.href, {
		method: "POST",
		headers,
		body: JSON.stringify(input),
	});
}

function getSetCookieHeader(response: Response): string | null {
	const cookies = response.headers.getSetCookie?.();
	if (cookies && cookies.length > 0) return cookies.join(", ");
	const single = response.headers.get("set-cookie");
	return single;
}

function formatCustomerProfile(
	row: NonNullable<
		Awaited<
			ReturnType<NonNullable<CustomerAuthServiceDeps["getProfileByUserId"]>>
		>
	>,
	email: string,
): CustomerProfileData {
	return {
		id: row.publicId,
		fullName: row.fullName,
		email,
		phoneNumber: row.phoneNumber,
		avatarUrl: row.avatarUrl,
		totalRides: row.totalRides,
		status: row.status,
		notificationPreferences: {
			pushEnabled: row.pushEnabled,
			promotionalEnabled: row.promotionalEnabled,
		},
		lastActiveAt: row.lastActiveAt.toISOString(),
		registeredAt: row.registeredAt.toISOString(),
	};
}

function extractErrorMessage(
	status: number,
	err: Record<string, unknown>,
): { status: number; code: string; message: string } {
	return {
		status,
		code: (err.code as string) ?? "AUTH_ERROR",
		message: (err.message as string) ?? "Authentication failed",
	};
}

export function createCustomerAuthService(deps?: CustomerAuthServiceDeps) {
	const authHandler = deps?.authHandler ?? ((req) => auth.handler(req));
	const createProfile = deps?.createProfile ?? defaultCreateCustomerProfile;
	const getProfileByUserId =
		deps?.getProfileByUserId ?? defaultGetCustomerProfileByUserId;
	const cleanupUser = deps?.cleanupUser ?? (async () => {});

	async function signUp(
		input: CustomerSignUpInput,
		request: Request,
	): Promise<CustomerAuthResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/sign-up/email",
			{
				name: input.fullName,
				email: input.email,
				password: input.password,
				principalType: "customer",
			},
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = (await betterRes.json()) as Record<string, unknown>;
			return {
				ok: false,
				error: extractErrorMessage(betterRes.status, err),
			};
		}

		const authData = (await betterRes.json()) as Record<string, unknown>;
		const setCookieHeader = getSetCookieHeader(betterRes);
		const user = authData.user as Record<string, unknown>;

		const created = await createProfile({
			userId: user.id as string,
			fullName: input.fullName,
			phoneNumber: input.phoneNumber,
		});

		if (!created) {
			await cleanupUser(user.id as string);
			return {
				ok: false,
				error: {
					status: 500,
					code: "CUSTOMER_SIGNUP_FAILED",
					message: "Failed to create customer profile",
				},
			};
		}

		const profile = await getProfileByUserId(user.id as string);

		if (!profile) {
			await cleanupUser(user.id as string);
			return {
				ok: false,
				error: {
					status: 500,
					code: "CUSTOMER_SIGNUP_FAILED",
					message: "Failed to create customer profile",
				},
			};
		}

		return {
			ok: true,
			data: {
				token: authData.token as string | null,
				user: {
					id: user.id as string,
					email: user.email as string,
					name: user.name as string,
					principalType: "customer",
				},
				customer: formatCustomerProfile(profile, user.email as string),
				setCookieHeader,
			},
		};
	}

	async function login(
		input: CustomerSignInInput,
		request: Request,
	): Promise<CustomerAuthResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/sign-in/email",
			{
				email: input.email,
				password: input.password,
			},
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = (await betterRes.json()) as Record<string, unknown>;
			return {
				ok: false,
				error: extractErrorMessage(betterRes.status, err),
			};
		}

		const authData = (await betterRes.json()) as Record<string, unknown>;
		const setCookieHeader = getSetCookieHeader(betterRes);
		const user = authData.user as Record<string, unknown>;
		const principalType = user.principalType as string | null;
		const acceptedTypes = ["customer", "consumer"];

		if (!principalType || !acceptedTypes.includes(principalType)) {
			return {
				ok: false,
				error: {
					status: 403,
					code: "INVALID_PRINCIPAL_TYPE",
					message: "This resource is for customer only",
				},
			};
		}

		const profile = await getProfileByUserId(user.id as string);

		if (!profile) {
			return {
				ok: false,
				error: {
					status: 403,
					code: "CUSTOMER_LOGIN_FAILED",
					message: "Customer profile was not found.",
				},
			};
		}

		return {
			ok: true,
			data: {
				token: authData.token as string | null,
				user: {
					id: user.id as string,
					email: user.email as string,
					name: user.name as string,
					principalType: "customer",
				},
				customer: formatCustomerProfile(profile, user.email as string),
				setCookieHeader,
			},
		};
	}

	return { signUp, login };
}

async function defaultCreateCustomerProfile(data: {
	userId: string;
	fullName: string;
	phoneNumber: string;
}) {
	const [row] = await db
		.insert(customer)
		.values({
			id: nanoid(),
			publicId: `cus_${nanoid(12)}`,
			userId: data.userId,
			fullName: data.fullName,
			phoneNumber: data.phoneNumber,
		})
		.returning();
	if (!row) return null;
	return { id: row.id, publicId: row.publicId };
}

async function defaultGetCustomerProfileByUserId(userId: string) {
	const [row] = await db
		.select()
		.from(customer)
		.where(eq(customer.userId, userId))
		.limit(1);
	return row ?? null;
}

export type CustomerAuthService = ReturnType<typeof createCustomerAuthService>;
