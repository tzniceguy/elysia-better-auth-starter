import { db } from "@api/db";
import { getStaffByUserId } from "@api/db/lookups";
import { staff } from "@api/db/schema";
import auth from "@api/utils/auth";
import { nanoid } from "nanoid";

export interface StaffSignUpInput {
	email: string;
	password: string;
	fullName: string;
	phoneNumber: string;
}

export interface StaffSignInInput {
	email: string;
	password: string;
}

export interface StaffProfileData {
	id: string;
	fullName: string;
	email: string;
	phoneNumber: string;
	avatarUrl: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
}

export type StaffAuthResult =
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
				staff: StaffProfileData;
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

export type LogoutResult =
	| { ok: true; data: { success: true } }
	| {
			ok: false;
			error: {
				status: number;
				code: string;
				message: string;
			};
	  };

export interface SessionData {
	id: string;
	token: string;
	createdAt: string;
	expiresAt: string;
	ipAddress: string | null;
	userAgent: string | null;
}

export type ListSessionsResult =
	| { ok: true; data: { sessions: SessionData[] } }
	| {
			ok: false;
			error: {
				status: number;
				code: string;
				message: string;
			};
	  };

export interface StaffAuthServiceDeps {
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
		status: string;
		createdAt: Date;
		updatedAt: Date;
	} | null>;
	cleanupUser?: (userId: string) => Promise<void>;
}

function buildForwardedRequest(
	path: string,
	input: Record<string, unknown>,
	request: Request,
	method: "GET" | "POST" = "POST",
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

	const init: RequestInit = { method, headers };
	if (method !== "GET") init.body = JSON.stringify(input);
	return new Request(url.href, init);
}

function getSetCookieHeader(response: Response): string | null {
	const cookies = response.headers.getSetCookie?.();
	if (cookies && cookies.length > 0) return cookies.join(", ");
	const single = response.headers.get("set-cookie");
	return single;
}

function formatStaffProfile(
	row: NonNullable<
		Awaited<ReturnType<NonNullable<StaffAuthServiceDeps["getProfileByUserId"]>>>
	>,
	email: string,
): StaffProfileData {
	return {
		id: row.publicId,
		fullName: row.fullName,
		email,
		phoneNumber: row.phoneNumber,
		avatarUrl: row.avatarUrl,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
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

function toIsoString(value: unknown): string {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) return date.toISOString();
	}
	return new Date(0).toISOString();
}

export function createStaffAuthService(deps?: StaffAuthServiceDeps) {
	const authHandler = deps?.authHandler ?? ((req) => auth.handler(req));
	const createProfile = deps?.createProfile ?? defaultCreateStaffProfile;
	const getProfileByUserId =
		deps?.getProfileByUserId ?? defaultGetStaffByUserId;
	const cleanupUser = deps?.cleanupUser ?? (async () => {});

	async function signUp(
		input: StaffSignUpInput,
		request: Request,
	): Promise<StaffAuthResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/sign-up/email",
			{
				name: input.fullName,
				email: input.email,
				password: input.password,
				principalType: "staff",
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
		const authUser = authData.user as Record<string, unknown>;

		const created = await createProfile({
			userId: authUser.id as string,
			fullName: input.fullName,
			phoneNumber: input.phoneNumber,
		});

		if (!created) {
			await cleanupUser(authUser.id as string);
			return {
				ok: false,
				error: {
					status: 500,
					code: "STAFF_SIGNUP_FAILED",
					message: "Failed to create staff profile",
				},
			};
		}

		const profile = await getProfileByUserId(authUser.id as string);
		if (!profile) {
			await cleanupUser(authUser.id as string);
			return {
				ok: false,
				error: {
					status: 500,
					code: "STAFF_SIGNUP_FAILED",
					message: "Failed to create staff profile",
				},
			};
		}

		return {
			ok: true,
			data: {
				token: authData.token as string | null,
				user: {
					id: authUser.id as string,
					email: authUser.email as string,
					name: authUser.name as string,
					principalType: "staff",
				},
				staff: formatStaffProfile(profile, authUser.email as string),
				setCookieHeader,
			},
		};
	}

	async function login(
		input: StaffSignInInput,
		request: Request,
	): Promise<StaffAuthResult> {
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
		const authUser = authData.user as Record<string, unknown>;
		const principalType = authUser.principalType as string | null;

		if (principalType !== "staff") {
			return {
				ok: false,
				error: {
					status: 403,
					code: "INVALID_PRINCIPAL_TYPE",
					message: "This resource is for staff only",
				},
			};
		}

		const profile = await getProfileByUserId(authUser.id as string);
		if (!profile) {
			return {
				ok: false,
				error: {
					status: 403,
					code: "STAFF_LOGIN_FAILED",
					message: "Staff profile was not found.",
				},
			};
		}

		return {
			ok: true,
			data: {
				token: authData.token as string | null,
				user: {
					id: authUser.id as string,
					email: authUser.email as string,
					name: authUser.name as string,
					principalType: "staff",
				},
				staff: formatStaffProfile(profile, authUser.email as string),
				setCookieHeader,
			},
		};
	}

	async function logout(request: Request): Promise<LogoutResult> {
		const forwarded = buildForwardedRequest("/api/auth/sign-out", {}, request);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = (await betterRes.json()) as Record<string, unknown>;
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		return { ok: true, data: { success: true } };
	}

	async function revokeSessions(request: Request): Promise<LogoutResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/revoke-sessions",
			{},
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = (await betterRes.json()) as Record<string, unknown>;
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		return { ok: true, data: { success: true } };
	}

	async function listSessions(request: Request): Promise<ListSessionsResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/list-sessions",
			{},
			request,
			"GET",
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = (await betterRes.json()) as Record<string, unknown>;
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		const data = (await betterRes.json()) as
			| Record<string, unknown>
			| Record<string, unknown>[];
		const rawSessions = Array.isArray(data)
			? data
			: ((data.sessions as Record<string, unknown>[] | undefined) ?? []);

		return {
			ok: true,
			data: {
				sessions: rawSessions.map((session) => ({
					id: String(session.id ?? ""),
					token: String(session.token ?? ""),
					createdAt: toIsoString(session.createdAt),
					expiresAt: toIsoString(session.expiresAt),
					ipAddress:
						typeof session.ipAddress === "string" ? session.ipAddress : null,
					userAgent:
						typeof session.userAgent === "string" ? session.userAgent : null,
				})),
			},
		};
	}

	async function revokeSession(
		request: Request,
		currentSessionToken: string,
		token: string,
	): Promise<LogoutResult> {
		if (currentSessionToken === token) {
			return {
				ok: false,
				error: {
					status: 409,
					code: "CANNOT_REVOKE_CURRENT_SESSION",
					message: "Cannot revoke the current session",
				},
			};
		}

		const forwarded = buildForwardedRequest(
			"/api/auth/revoke-session",
			{ token },
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = (await betterRes.json()) as Record<string, unknown>;
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		return { ok: true, data: { success: true } };
	}

	return { signUp, login, logout, revokeSessions, listSessions, revokeSession };
}

async function defaultCreateStaffProfile(data: {
	userId: string;
	fullName: string;
	phoneNumber: string;
}) {
	const [row] = await db
		.insert(staff)
		.values({
			id: nanoid(),
			publicId: `stf_${nanoid(12)}`,
			userId: data.userId,
			fullName: data.fullName,
			phoneNumber: data.phoneNumber,
		})
		.returning();
	if (!row) return null;
	return { id: row.id, publicId: row.publicId };
}

async function defaultGetStaffByUserId(userId: string) {
	return getStaffByUserId(userId);
}

export type StaffAuthService = ReturnType<typeof createStaffAuthService>;
