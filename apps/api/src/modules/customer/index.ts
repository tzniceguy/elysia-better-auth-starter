import Elysia from "elysia";
import { createCustomerAuthRoutes } from "./auth/routes";
import {
	createCustomerAuthService,
	type CustomerAuthService,
} from "./auth/service";
import { createCustomerProfileRoutes } from "./profile/routes";
import {
	createCustomerProfileService,
	type CustomerProfileService,
} from "./profile/service";

export const createCustomerApp = (services?: {
	customerAuthService?: CustomerAuthService;
	customerProfileService?: CustomerProfileService;
}) => {
	const customerAuthService =
		services?.customerAuthService ?? createCustomerAuthService();
	const customerProfileService =
		services?.customerProfileService ?? createCustomerProfileService();

	return new Elysia()
		.use(createCustomerAuthRoutes(customerAuthService))
		.use(createCustomerProfileRoutes(customerProfileService));
};
