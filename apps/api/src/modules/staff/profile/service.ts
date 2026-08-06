import { db } from "@api/db";
import { staff, user } from "@api/db/schema";
import { and, eq } from "drizzle-orm";

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

export interface UpdateStaffProfileInput {
	fullName?: string;
	phoneNumber?: string;
	avatarUrl?: string | null;
}

export type StaffProfileResult =
	| { ok: true; data: StaffProfileData }
	| {
			ok: false;
			error: {
				status: number;
				code: string;
				message: string;
			};
	  };

export interface StaffProfileService {
	get: (staffId: string, userId: string) => Promise<StaffProfileResult>;
	update: (
		staffId: string,
		userId: string,
		input: UpdateStaffProfileInput,
	) => Promise<StaffProfileResult>;
}

const mapStaffProfile = (row: {
	profile: typeof staff.$inferSelect;
	email: string;
}): StaffProfileData => ({
	id: row.profile.publicId,
	fullName: row.profile.fullName,
	email: row.email,
	phoneNumber: row.profile.phoneNumber,
	avatarUrl: row.profile.avatarUrl,
	status: row.profile.status,
	createdAt: row.profile.createdAt.toISOString(),
	updatedAt: row.profile.updatedAt.toISOString(),
});

export function createStaffProfileService(): StaffProfileService {
	const get: StaffProfileService["get"] = async (staffId, userId) => {
		const [row] = await db
			.select({ profile: staff, email: user.email })
			.from(staff)
			.innerJoin(user, eq(staff.userId, user.id))
			.where(and(eq(staff.id, staffId), eq(staff.userId, userId)))
			.limit(1);

		if (!row) {
			return {
				ok: false,
				error: {
					status: 404,
					code: "STAFF_PROFILE_NOT_FOUND",
					message: "Staff profile was not found.",
				},
			};
		}

		return { ok: true, data: mapStaffProfile(row) };
	};

	const update: StaffProfileService["update"] = async (staffId, userId, input) => {
		const updates: Partial<{
			fullName: string;
			phoneNumber: string;
			avatarUrl: string | null;
			updatedAt: Date;
		}> = {};

		if (input.fullName !== undefined) updates.fullName = input.fullName;
		if (input.phoneNumber !== undefined) updates.phoneNumber = input.phoneNumber;
		if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;

		if (Object.keys(updates).length === 0) {
			return get(staffId, userId);
		}

		updates.updatedAt = new Date();

		await db
			.update(staff)
			.set(updates)
			.where(and(eq(staff.id, staffId), eq(staff.userId, userId)));

		const result = await get(staffId, userId);
		if (!result.ok) {
			return {
				ok: false,
				error: {
					status: 500,
					code: "STAFF_PROFILE_UPDATE_FAILED",
					message: "Failed to update staff profile.",
				},
			};
		}

		return result;
	};

	return { get, update };
}
