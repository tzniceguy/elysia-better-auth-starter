import { db } from "@api/db";
import { customer } from "@api/db/schema";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { authPlugin } from "../auth";

export const customerGuard = new Elysia({ name: "customer-guard" })
	.use(authPlugin)
	.derive({ as: "global" }, async ({ user }) => {
		if (user?.principalType !== "customer") {
			return { customerSession: null };
		}

		const [row] = await db
			.select({ id: customer.id })
			.from(customer)
			.where(eq(customer.userId, user.id))
			.limit(1);

		if (!row) return { customerSession: null };
		return { customerSession: { customerId: row.id, userId: user.id } };
	})
	.macro({
		customerOnly: (enabled: boolean) => ({
			resolve({ customerSession, status }) {
				if (enabled && !customerSession) {
					return status(403, { message: "Customers only route" });
				}
				return { customerSession };
			},
		}),
	});
