import { db as realDb } from "@api/db";
import { staff, user } from "@api/db/schema";
import auth from "@api/utils/auth";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export type StaffRegisterRole = "zone_manager" | "admin";

export interface StaffRegisterInput {
	email: string;
	password: string;
	fullName: string;
	phoneNumber: string;
	role: StaffRegisterRole;
}

export interface StaffRegisterData {
	id: string;
	fullName: string;
	email: string;
	phoneNumber: string;
	role: StaffRegisterRole;
	status: string;
}

export type StaffRegisterResult =
	| { ok: true; data: StaffRegisterData }
	| {
			ok: false;
			error: { status: number; code: string; message: string };
	  };

export interface StaffRegisterServiceDeps {
	db?: typeof realDb;
	signUpEmail?: (input: {
		body: {
			name: string;
			email: string;
			password: string;
			principalType: "staff";
		};
	}) => Promise<{ user: { id: string; email: string } }>;
	deleteUser?: (userId: string) => Promise<void>;
}

export function staffRoleFromUserRole(role: StaffRegisterRole): string {
	return role === "admin" ? "admin" : "operations";
}

function isDuplicateEmailError(err: unknown): boolean {
	if (!err || typeof err !== "object") return false;
	const record = err as Record<string, unknown>;
	const code = typeof record.code === "string" ? record.code : "";
	const message = typeof record.message === "string" ? record.message : "";
	const status =
		typeof record.status === "number"
			? record.status
			: typeof record.statusCode === "number"
				? record.statusCode
				: null;
	if (
		code === "USER_ALREADY_EXISTS" ||
		code === "EMAIL_ALREADY_EXISTS" ||
		code === "EMAIL_IN_USE"
	) {
		return true;
	}
	if (status === 422 || status === 409) return true;
	if (/already (exists|in use)/i.test(message)) return true;
	return false;
}

async function defaultSignUpEmail(input: {
	body: {
		name: string;
		email: string;
		password: string;
		principalType: "staff";
	};
}): Promise<{ user: { id: string; email: string } }> {
	const result = await auth.api.signUpEmail({
		body: input.body,
		headers: new Headers(),
	});
	return {
		user: {
			id: result.user.id,
			email: result.user.email,
		},
	};
}

async function defaultDeleteUser(userId: string): Promise<void> {
	// auth.api.deleteUser requires the target user's session, so rollback
	// deletes the row directly (FK cascades clean up sessions/accounts).
	await realDb.delete(user).where(eq(user.id, userId));
}

export interface StaffRegisterService {
	registerStaff: (
		adminStaffId: string,
		adminRole: string | null | undefined,
		input: StaffRegisterInput,
	) => Promise<StaffRegisterResult>;
}

export function createStaffRegisterService(
	deps?: StaffRegisterServiceDeps,
): StaffRegisterService {
	const database = deps?.db ?? realDb;
	const signUpEmail = deps?.signUpEmail ?? defaultSignUpEmail;
	const deleteUser = deps?.deleteUser ?? defaultDeleteUser;

	async function registerStaff(
		_adminStaffId: string,
		adminRole: string | null | undefined,
		input: StaffRegisterInput,
	): Promise<StaffRegisterResult> {
		if (adminRole !== "admin") {
			return {
				ok: false,
				error: {
					status: 403,
					code: "FORBIDDEN",
					message: "Only admins can register staff.",
				},
			};
		}

		if (
			!input.email ||
			!input.password ||
			!input.fullName ||
			!input.phoneNumber
		) {
			return {
				ok: false,
				error: {
					status: 400,
					code: "STAFF_REGISTER_REQUIRED",
					message:
						"email, password, fullName and phoneNumber are required.",
				},
			};
		}

		try {
			const signedUp = await signUpEmail({
				body: {
					name: input.fullName,
					email: input.email,
					password: input.password,
					principalType: "staff",
				},
			});
			const userId = signedUp.user.id;

			await database
				.update(user)
				.set({ staffRole: staffRoleFromUserRole(input.role) })
				.where(eq(user.id, userId));

			const [row] = await database
				.insert(staff)
				.values({
					id: nanoid(),
					publicId: `stf_${nanoid(12)}`,
					userId,
					fullName: input.fullName,
					phoneNumber: input.phoneNumber,
					role: input.role,
					status: "active",
				})
				.returning();

			if (!row) {
				await deleteUser(userId);
				return {
					ok: false,
					error: {
						status: 500,
						code: "STAFF_REGISTER_FAILED",
						message: "Failed to create staff profile.",
					},
				};
			}

			return {
				ok: true,
				data: {
					id: row.publicId,
					fullName: row.fullName,
					email: input.email,
					phoneNumber: row.phoneNumber,
					role: row.role as StaffRegisterRole,
					status: row.status,
				},
			};
		} catch (err) {
			if (isDuplicateEmailError(err)) {
				return {
					ok: false,
					error: {
						status: 409,
						code: "EMAIL_IN_USE",
						message: "Email is already in use.",
					},
				};
			}
			return {
				ok: false,
				error: {
					status: 500,
					code: "STAFF_REGISTER_FAILED",
					message: "Failed to register staff.",
				},
			};
		}
	}

	return { registerStaff };
}

export type { StaffRegisterService as StaffRegisterServiceType };
