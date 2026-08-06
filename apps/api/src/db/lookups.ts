import { eq } from "drizzle-orm";
import { db } from ".";
import { customer, staff } from "./schema";

export async function getCustomerByUserId(userId: string) {
	const [row] = await db
		.select()
		.from(customer)
		.where(eq(customer.userId, userId))
		.limit(1);
	return row ?? null;
}

export async function getStaffByUserId(userId: string) {
	const [row] = await db
		.select()
		.from(staff)
		.where(eq(staff.userId, userId))
		.limit(1);
	return row ?? null;
}
