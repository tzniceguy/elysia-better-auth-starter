import { fail, ok } from "@api/lib/http";
import { errorResponse, successSchema } from "@api/lib/response-schema";
import { adminGuard } from "@api/plugins/guards/admin-guard";
import { Elysia, t } from "elysia";
import {
	createStaffRegisterService,
	type StaffRegisterService,
} from "./service";

const registerBody = t.Object({
	email: t.String(),
	password: t.String(),
	fullName: t.String(),
	phoneNumber: t.String(),
	role: t.Union([t.Literal("zone_manager"), t.Literal("admin")]),
});

const staffSchema = t.Object({
	id: t.String(),
	fullName: t.String(),
	email: t.String(),
	phoneNumber: t.String(),
	role: t.String(),
	status: t.String(),
});

export function createStaffRegisterRoutes(
	service: StaffRegisterService = createStaffRegisterService(),
) {
	return new Elysia({
		prefix: "/v1/app/staff",
		tags: ["staff-register"],
		normalize: "typebox",
	})
		.use(adminGuard)
		.guard({ adminOnly: true }, (app) =>
			app.post(
				"/register",
				async ({ body, staffSession, set }) => {
					if (!staffSession) {
						set.status = 403;
						return fail("FORBIDDEN", "Admin only route");
					}
					const session = staffSession as {
						staffId: string;
						role?: string;
					};
					const result = await service.registerStaff(
						session.staffId,
						session.role,
						body,
					);
					if (!result.ok) {
						set.status = result.error.status;
						return fail(result.error.code, result.error.message);
					}
					return ok(result.data);
				},
				{
					body: registerBody,
					response: {
						200: successSchema(staffSchema),
						400: errorResponse,
						403: errorResponse,
						409: errorResponse,
						500: errorResponse,
					},
					detail: {
						tags: ["staff-register"],
						summary: "Register staff (admin only)",
					},
				},
			),
		);
}
