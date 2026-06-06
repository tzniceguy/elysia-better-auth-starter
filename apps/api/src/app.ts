import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import logixlysia from "logixlysia";
import { createCustomerAuthRoutes } from "./modules/customer/auth/routes";
import {
	type CustomerAuthService,
	createCustomerAuthService,
} from "./modules/customer/auth/service";
import { createDriverAuthRoutes } from "./modules/driver/auth/routes";
import {
	createDriverAuthService,
	type DriverAuthService,
} from "./modules/driver/auth/service";
import auth from "./utils/auth";

export const createApp = async (services?: {
	customerAuthService?: CustomerAuthService;
	driverAuthService?: DriverAuthService;
}) => {
	const customerAuthService =
		services?.customerAuthService ?? createCustomerAuthService();
	const driverAuthService =
		services?.driverAuthService ?? createDriverAuthService();

	return new Elysia()
		.use(
			logixlysia({
				config: {
					showStartupMessage: true,
					timestamp: { translateTime: "yyyy-mm-dd HH:MM:ss" },
					ip: true,
				},
			}),
		)
		.use(
			cors({
				origin: ["http://localhost:3000"],
				methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				credentials: true,
				allowedHeaders: ["Content-Type", "Authorization"],
			}),
		)
		.use(
			openapi({
				documentation: {
					info: {
						title: "Move API",
						version: "0.0.0",
						description: "Shared backend API for customer and driver clients.",
					},
					tags: [
						{ name: "system", description: "System and health endpoints" },
						{ name: "better-auth", description: "Better Auth endpoints" },
						{
							name: "customer-auth",
							description: "Customer authentication",
						},
						{
							name: "driver-auth",
							description: "Driver authentication",
						},
					],
				},
			}),
		)
		.get(
			"/",
			() => ({
				name: "move-api",
				status: "ok",
				docs: "/openapi",
			}),
			{
				detail: {
					tags: ["system"],
					summary: "API root",
				},
			},
		)
		.get(
			"/health",
			() => ({
				name: "move-api",
				status: "ok",
			}),
			{
				detail: {
					tags: ["system"],
					summary: "Health check",
				},
			},
		)
		.use(createCustomerAuthRoutes(customerAuthService))
		.use(createDriverAuthRoutes(driverAuthService))
		.mount(auth.handler);
};

export const app = await createApp();
export type App = typeof app;
