import { describe, expect, it } from "bun:test";
import {
	createStaffRegisterService,
	type StaffRegisterInput,
} from "@api/modules/staff/register/service";

const baseInput: StaffRegisterInput = {
	email: "zone@example.com",
	password: "password123",
	fullName: "Zone Manager",
	phoneNumber: "+255700000001",
	role: "zone_manager",
};

interface MockDbCalls {
	updateSets: Record<string, unknown>[];
	inserts: Record<string, unknown>[];
}

function createMockDb(insertRows: unknown[] | null) {
	const calls: MockDbCalls = { updateSets: [], inserts: [] };
	const db = {
		update: (_table: unknown) => ({
			set: (values: Record<string, unknown>) => {
				calls.updateSets.push(values);
				return {
					where: async () => [],
				};
			},
		}),
		insert: (_table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				calls.inserts.push(values);
				return {
					returning: async () => insertRows ?? [],
				};
			},
		}),
	};
	// biome-ignore lint/suspicious/noExplicitAny: mock db for unit tests
	return { db: db as any, calls };
}

function staffRow(overrides?: Record<string, unknown>) {
	return {
		id: "internal_1",
		publicId: "stf_test123456",
		fullName: baseInput.fullName,
		phoneNumber: baseInput.phoneNumber,
		role: "zone_manager",
		status: "active",
		...overrides,
	};
}

describe("Staff register service", () => {
	it("registers a zone_manager and sets user staffRole to operations", async () => {
		const { db, calls } = createMockDb([staffRow()]);
		const service = createStaffRegisterService({
			db,
			signUpEmail: async () => ({
				user: { id: "usr_1", email: baseInput.email },
			}),
		});

		const result = await service.registerStaff(
			"staff_admin_1",
			"admin",
			baseInput,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.role).toBe("zone_manager");
		expect(result.data.id).toBe("stf_test123456");
		expect(calls.updateSets).toHaveLength(1);
		expect(calls.updateSets[0]).toMatchObject({ staffRole: "operations" });
		expect(calls.inserts).toHaveLength(1);
		expect(calls.inserts[0]).toMatchObject({ role: "zone_manager" });
	});

	it("registers an admin and sets user staffRole to admin", async () => {
		const { db, calls } = createMockDb([staffRow({ role: "admin" })]);
		const service = createStaffRegisterService({
			db,
			signUpEmail: async () => ({
				user: { id: "usr_2", email: "admin2@example.com" },
			}),
		});

		const result = await service.registerStaff("staff_admin_1", "admin", {
			...baseInput,
			email: "admin2@example.com",
			role: "admin",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.role).toBe("admin");
		expect(calls.updateSets[0]).toMatchObject({ staffRole: "admin" });
	});

	it("rejects non-admin callers with FORBIDDEN", async () => {
		const { db, calls } = createMockDb([staffRow()]);
		let signUpCalls = 0;
		const service = createStaffRegisterService({
			db,
			signUpEmail: async () => {
				signUpCalls += 1;
				return { user: { id: "usr_x", email: baseInput.email } };
			},
		});

		const result = await service.registerStaff(
			"staff_zone_1",
			"zone_manager",
			baseInput,
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(403);
		expect(result.error.code).toBe("FORBIDDEN");
		expect(signUpCalls).toBe(0);
		expect(calls.inserts).toHaveLength(0);
	});

	it("rejects missing required fields with STAFF_REGISTER_REQUIRED", async () => {
		const { db } = createMockDb([staffRow()]);
		const service = createStaffRegisterService({
			db,
			signUpEmail: async () => ({
				user: { id: "usr_1", email: baseInput.email },
			}),
		});

		const result = await service.registerStaff("staff_admin_1", "admin", {
			...baseInput,
			email: "",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(400);
		expect(result.error.code).toBe("STAFF_REGISTER_REQUIRED");
	});

	it("returns EMAIL_IN_USE when sign-up throws a duplicate-email error", async () => {
		const { db } = createMockDb([staffRow()]);
		const service = createStaffRegisterService({
			db,
			signUpEmail: async () => {
				throw { code: "USER_ALREADY_EXISTS", message: "User already exists" };
			},
		});

		const result = await service.registerStaff(
			"staff_admin_1",
			"admin",
			baseInput,
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(409);
		expect(result.error.code).toBe("EMAIL_IN_USE");
	});

	it("cleans up the auth user when the staff insert returns no row", async () => {
		const { db } = createMockDb([]);
		const deletedUserIds: string[] = [];
		const service = createStaffRegisterService({
			db,
			signUpEmail: async () => ({
				user: { id: "usr_cleanup", email: baseInput.email },
			}),
			deleteUser: async (userId: string) => {
				deletedUserIds.push(userId);
			},
		});

		const result = await service.registerStaff(
			"staff_admin_1",
			"admin",
			baseInput,
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.status).toBe(500);
		expect(result.error.code).toBe("STAFF_REGISTER_FAILED");
		expect(deletedUserIds).toEqual(["usr_cleanup"]);
	});
});
