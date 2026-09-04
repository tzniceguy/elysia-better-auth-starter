import { Elysia } from "elysia";
import { staffGuard } from "./staff-guard";

export const adminGuard = new Elysia({ name: "admin-guard" })
	.use(staffGuard)
	.macro({
		adminOnly: (enabled: boolean) => ({
			resolve({ staffSession, status }) {
				if (!enabled) return { staffSession };
				if (!staffSession) {
					return status(403, { message: "Admin only route" });
				}
				const role = (
					staffSession as { role?: string } | null
				)?.role;
				if (role !== "admin") {
					return status(403, { message: "Admin only route" });
				}
				return { staffSession };
			},
		}),
	});
