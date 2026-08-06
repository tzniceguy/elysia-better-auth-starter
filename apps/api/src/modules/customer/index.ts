import Elysia from "elysia";
import { createCustomerAuthRoutes } from "./auth/routes";
import {
	type CustomerAuthService,
	createCustomerAuthService,
} from "./auth/service";
import { createCustomerProfileRoutes } from "./profile/routes";
import {
	type CustomerProfileService,
	createCustomerProfileService,
} from "./profile/service";

export const customerApp = async (services?: {
	customerAuthService?: CustomerAuthService;
	customerProfileService?: CustomerProfileService;
}) => {
	const customerAuthService =
		services?.customerAuthService ?? createCustomerAuthService();
	const customerProfileService =
		services?.customerProfileService ?? createCustomerProfileService();

	return new Elysia({ normalize: "typebox" })
		.use(createCustomerAuthRoutes(customerAuthService))
		.use(createCustomerProfileRoutes(customerProfileService));
};
