import { db } from "@api/db";
import { getCustomerByUserId } from "@api/db/lookups";
import { customer } from "@api/db/schema";
import {
	buildForwardedRequest,
	extractErrorMessage,
	getSetCookieHeader,
	readErrorBody,
} from "@api/lib/auth-forward";
import auth from "@api/utils/auth";
import { env } from "@api/env";
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
		status: string;
		pushEnabled: boolean;
		promotionalEnabled: boolean;
		lastActiveAt: Date;
		registeredAt: Date;
	} | null>;
	cleanupUser?: (userId: string) => Promise<void>;
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
		status: row.status,
		notificationPreferences: {
			pushEnabled: row.pushEnabled,
			promotionalEnabled: row.promotionalEnabled,
		},
		lastActiveAt: row.lastActiveAt.toISOString(),
		registeredAt: row.registeredAt.toISOString(),
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

		if (principalType !== "customer") {
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

	async function forgetPassword(
		input: { email: string; redirectTo?: string },
		request: Request,
	): Promise<LogoutResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/request-password-reset",
			{ email: input.email, redirectTo: input.redirectTo ?? env.APP_CUSTOMER_URL },
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = await readErrorBody(betterRes);
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		return { ok: true, data: { success: true } };
	}

	async function resetPassword(
		input: { token: string; newPassword: string },
		request: Request,
	): Promise<LogoutResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/reset-password",
			{ token: input.token, newPassword: input.newPassword },
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = await readErrorBody(betterRes);
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		return { ok: true, data: { success: true } };
	}

	async function resendVerification(
		input: { email: string },
		request: Request,
	): Promise<LogoutResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/send-verification-email",
			{ email: input.email, callbackURL: env.APP_CUSTOMER_URL },
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = await readErrorBody(betterRes);
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		return { ok: true, data: { success: true } };
	}

	async function changePassword(
		input: { currentPassword: string; newPassword: string },
		request: Request,
	): Promise<LogoutResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/change-password",
			{
				currentPassword: input.currentPassword,
				newPassword: input.newPassword,
				revokeOtherSessions: true,
			},
			request,
		);
		const betterRes = await authHandler(forwarded);

		if (!betterRes.ok) {
			const err = await readErrorBody(betterRes);
			return { ok: false, error: extractErrorMessage(betterRes.status, err) };
		}

		try {
			const session = await auth.api.getSession({ headers: request.headers });
			const email = session?.user?.email;
			if (email) {
				const { notificationQueue } = await import(
					"@api/minions/notification/notification.queue"
				);
				const { enqueueEmail } = await import(
					"@api/minions/notification/enqueue"
				);
				const { noticeTemplate } = await import("@api/utils/mail");
				const template = noticeTemplate(
					"Password changed",
					"Your password was changed. If this was not you, reset it immediately.",
				);
				await enqueueEmail(db, notificationQueue, {
					to: email,
					subject: template.subject,
					html: template.html,
					kind: "password_changed",
				});
			}
		} catch {
			// notice is best-effort
		}

		return { ok: true, data: { success: true } };
	}

	return {
		signUp,
		login,
		logout,
		revokeSessions,
		listSessions,
		revokeSession,
		forgetPassword,
		resetPassword,
		resendVerification,
		changePassword,
	};
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
	return getCustomerByUserId(userId);
}

export type CustomerAuthService = ReturnType<typeof createCustomerAuthService>;
