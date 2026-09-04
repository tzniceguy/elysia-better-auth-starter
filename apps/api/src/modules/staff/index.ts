import Elysia from "elysia";
import { createStaffAuthRoutes } from "./auth/routes";
import { createStaffAuthService, type StaffAuthService } from "./auth/service";
import { createStaffProfileRoutes } from "./profile/routes";
import {
	createStaffProfileService,
	type StaffProfileService,
} from "./profile/service";
import { createStaffRegisterRoutes } from "./register/routes";
import {
	createStaffRegisterService,
	type StaffRegisterService,
} from "./register/service";

export const staffApp = async (services?: {
	staffAuthService?: StaffAuthService;
	staffProfileService?: StaffProfileService;
	staffRegisterService?: StaffRegisterService;
}) => {
	const staffAuthService =
		services?.staffAuthService ?? createStaffAuthService();
	const staffProfileService =
		services?.staffProfileService ?? createStaffProfileService();
	const staffRegisterService =
		services?.staffRegisterService ?? createStaffRegisterService();

	return new Elysia({ normalize: "typebox" })
		.use(createStaffAuthRoutes(staffAuthService))
		.use(createStaffProfileRoutes(staffProfileService))
		.use(createStaffRegisterRoutes(staffRegisterService));
};
