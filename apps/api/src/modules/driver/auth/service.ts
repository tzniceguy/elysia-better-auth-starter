import { db } from "@api/db";
import { driver } from "@api/db/schema";
import auth from "@api/utils/auth";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export interface DriverSignUpInput {
	email: string;
	password: string;
	fullName: string;
	phoneNumber: string;
	vehicleType: string;
	licenseNumber: string;
}

export interface DriverSignInInput {
	email: string;
	password: string;
}

export interface DriverProfileData {
	id: string;
	fullName: string;
	email: string;
	phoneNumber: string;
	vehicleType: string;
	licenseNumber: string;
	avatarUrl: string | null;
	deliveryCount: number;
	ratingAverage: number;
	availability: string;
	status: string;
	currentLat: number | null;
	currentLng: number | null;
}

export type DriverAuthResult =
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
				driver: DriverProfileData;
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

export interface DriverAuthServiceDeps {
	authHandler?: (request: Request) => Promise<Response>;
	createProfile?: (data: {
		userId: string;
		fullName: string;
		phoneNumber: string;
		vehicleType: string;
		licenseNumber: string;
	}) => Promise<{
		id: string;
		publicId: string;
	} | null>;
	getProfileByUserId?: (userId: string) => Promise<{
		id: string;
		publicId: string;
		fullName: string;
		phoneNumber: string;
		vehicleType: string;
		licenseNumber: string;
		avatarUrl: string | null;
		deliveryCount: number;
		ratingAverage: number;
		availability: string;
		status: string;
		currentLat: number | null;
		currentLng: number | null;
	} | null>;
	cleanupUser?: (userId: string) => Promise<void>;
}

function buildForwardedRequest(
	path: string,
	body: Record<string, unknown>,
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
		body: JSON.stringify(body),
	});
}

function getSetCookieHeader(response: Response): string | null {
	const cookies = response.headers.getSetCookie?.();
	if (cookies && cookies.length > 0) return cookies.join(", ");
	const single = response.headers.get("set-cookie");
	return single;
}

function formatDriverProfile(
	row: NonNullable<
		Awaited<
			ReturnType<NonNullable<DriverAuthServiceDeps["getProfileByUserId"]>>
		>
	>,
	email: string,
): DriverProfileData {
	return {
		id: row.publicId,
		fullName: row.fullName,
		email,
		phoneNumber: row.phoneNumber,
		vehicleType: row.vehicleType,
		licenseNumber: row.licenseNumber,
		avatarUrl: row.avatarUrl,
		deliveryCount: row.deliveryCount,
		ratingAverage: row.ratingAverage,
		availability: row.availability,
		status: row.status,
		currentLat: row.currentLat,
		currentLng: row.currentLng,
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

export function createDriverAuthService(deps?: DriverAuthServiceDeps) {
	const authHandler = deps?.authHandler ?? ((req) => auth.handler(req));
	const createProfile = deps?.createProfile ?? defaultCreateDriverProfile;
	const getProfileByUserId =
		deps?.getProfileByUserId ?? defaultGetDriverProfileByUserId;
	const cleanupUser = deps?.cleanupUser ?? (async () => {});

	async function signUp(
		input: DriverSignUpInput,
		request: Request,
	): Promise<DriverAuthResult> {
		const forwarded = buildForwardedRequest(
			"/api/auth/sign-up/email",
			{
				name: input.fullName,
				email: input.email,
				password: input.password,
				principalType: "driver",
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
			vehicleType: input.vehicleType,
			licenseNumber: input.licenseNumber,
		});

		if (!created) {
			await cleanupUser(user.id as string);
			return {
				ok: false,
				error: {
					status: 500,
					code: "DRIVER_SIGNUP_FAILED",
					message: "Failed to create driver profile",
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
					code: "DRIVER_SIGNUP_FAILED",
					message: "Failed to create driver profile",
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
					principalType: "driver",
				},
				driver: formatDriverProfile(profile, user.email as string),
				setCookieHeader,
			},
		};
	}

	async function login(
		input: DriverSignInInput,
		request: Request,
	): Promise<DriverAuthResult> {
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

		if (principalType !== "driver") {
			return {
				ok: false,
				error: {
					status: 403,
					code: "INVALID_PRINCIPAL_TYPE",
					message: "This resource is for driver only",
				},
			};
		}

		const profile = await getProfileByUserId(user.id as string);

		if (!profile) {
			return {
				ok: false,
				error: {
					status: 403,
					code: "DRIVER_LOGIN_FAILED",
					message: "Driver profile was not found.",
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
					principalType: "driver",
				},
				driver: formatDriverProfile(profile, user.email as string),
				setCookieHeader,
			},
		};
	}

	return { signUp, login };
}

async function defaultCreateDriverProfile(data: {
	userId: string;
	fullName: string;
	phoneNumber: string;
	vehicleType: string;
	licenseNumber: string;
}) {
	const [row] = await db
		.insert(driver)
		.values({
			id: nanoid(),
			publicId: `drv_${nanoid(12)}`,
			userId: data.userId,
			fullName: data.fullName,
			phoneNumber: data.phoneNumber,
			vehicleType: data.vehicleType,
			licenseNumber: data.licenseNumber,
		})
		.returning();
	if (!row) return null;
	return { id: row.id, publicId: row.publicId };
}

async function defaultGetDriverProfileByUserId(userId: string) {
	const [row] = await db
		.select()
		.from(driver)
		.where(eq(driver.userId, userId))
		.limit(1);
	return row ?? null;
}

export type DriverAuthService = ReturnType<typeof createDriverAuthService>;
