import { db } from "@api/db";
import { customer, user } from "@api/db/schema";
import { and, eq } from "drizzle-orm";

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

export interface UpdateCustomerProfileInput {
	fullName?: string;
	phoneNumber?: string;
	avatarUrl?: string | null;
}

export type CustomerProfileResult =
	| { ok: true; data: CustomerProfileData }
	| {
			ok: false;
			error: {
				status: number;
				code: string;
				message: string;
			};
	  };

export interface CustomerProfileService {
	get: (customerId: string, userId: string) => Promise<CustomerProfileResult>;
	update: (
		customerId: string,
		userId: string,
		input: UpdateCustomerProfileInput,
	) => Promise<CustomerProfileResult>;
}

const mapCustomerProfile = (row: {
	profile: typeof customer.$inferSelect;
	email: string;
}): CustomerProfileData => ({
	id: row.profile.publicId,
	fullName: row.profile.fullName,
	email: row.email,
	phoneNumber: row.profile.phoneNumber,
	avatarUrl: row.profile.avatarUrl,
	status: row.profile.status,
	notificationPreferences: {
		pushEnabled: row.profile.pushEnabled,
		promotionalEnabled: row.profile.promotionalEnabled,
	},
	lastActiveAt: row.profile.lastActiveAt.toISOString(),
	registeredAt: row.profile.registeredAt.toISOString(),
});

export function createCustomerProfileService(): CustomerProfileService {
	const get: CustomerProfileService["get"] = async (customerId, userId) => {
		const [row] = await db
			.select({ profile: customer, email: user.email })
			.from(customer)
			.innerJoin(user, eq(customer.userId, user.id))
			.where(and(eq(customer.id, customerId), eq(customer.userId, userId)))
			.limit(1);

		if (!row) {
			return {
				ok: false,
				error: {
					status: 404,
					code: "CUSTOMER_PROFILE_NOT_FOUND",
					message: "Customer profile was not found.",
				},
			};
		}

		return { ok: true, data: mapCustomerProfile(row) };
	};

	const update: CustomerProfileService["update"] = async (
		customerId,
		userId,
		input,
	) => {
		const updates: Partial<{
			fullName: string;
			phoneNumber: string;
			avatarUrl: string | null;
			lastActiveAt: Date;
		}> = {};

		if (input.fullName !== undefined) updates.fullName = input.fullName;
		if (input.phoneNumber !== undefined) updates.phoneNumber = input.phoneNumber;
		if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;

		if (Object.keys(updates).length === 0) {
			return get(customerId, userId);
		}

		updates.lastActiveAt = new Date();

		await db
			.update(customer)
			.set(updates)
			.where(and(eq(customer.id, customerId), eq(customer.userId, userId)));

		const result = await get(customerId, userId);
		if (!result.ok) {
			return {
				ok: false,
				error: {
					status: 500,
					code: "CUSTOMER_PROFILE_UPDATE_FAILED",
					message: "Failed to update customer profile.",
				},
			};
		}

		return result;
	};

	return { get, update };
}
