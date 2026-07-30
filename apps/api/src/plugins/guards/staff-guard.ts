import { db } from "@api/db";
import { staff } from "@api/db/schema";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { authPlugin } from "../auth";

export const staffGuard = new Elysia({ name: "staff-guard" })
	.use(authPlugin)
	.derive({ as: "global" }, async ({ user }) => {
		if (!user || user.principalType !== "staff") {
			return { staffSession: null };
		}

		const [row] = await db
			.select({ id: staff.id })
			.from(staff)
			.where(eq(staff.userId, user.id))
			.limit(1);

		if (!row) return { staffSession: null };
		return { staffSession: { staffId: row.id, userId: user.id } };
	})
	.macro({
		staffOnly: (enabled: boolean) => ({
			resolve({ staffSession, status }) {
				if (enabled && !staffSession) {
					return status(403, { message: "Staff only route" });
				}
				return { staffSession: staffSession! };
			},
		}),
	});
