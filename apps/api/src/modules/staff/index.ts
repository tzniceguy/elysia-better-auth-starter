import Elysia from "elysia";
import { createStaffAuthRoutes } from "./auth/routes";
import { createStaffAuthService, type StaffAuthService } from "./auth/service";
import { createStaffProfileRoutes } from "./profile/routes";
import {
	createStaffProfileService,
	type StaffProfileService,
} from "./profile/service";

export const staffApp = async (services?: {
	staffAuthService?: StaffAuthService;
	staffProfileService?: StaffProfileService;
}) => {
	const staffAuthService =
		services?.staffAuthService ?? createStaffAuthService();
	const staffProfileService =
		services?.staffProfileService ?? createStaffProfileService();

	return new Elysia({ normalize: "typebox" })
		.use(createStaffAuthRoutes(staffAuthService))
		.use(createStaffProfileRoutes(staffProfileService));
};
