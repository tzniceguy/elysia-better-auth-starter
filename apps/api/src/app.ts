import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import logixlysia from "logixlysia";
import { createCustomerApp } from "./modules/customer";
import {
	type CustomerAuthService,
	createCustomerAuthService,
} from "./modules/customer/auth/service";
import {
	createCustomerProfileService,
	type CustomerProfileService,
} from "./modules/customer/profile/service";
import { createStaffApp } from "./modules/staff";
import { createStaffAuthService, type StaffAuthService } from "./modules/staff/auth/service";
import {
	createStaffProfileService,
	type StaffProfileService,
} from "./modules/staff/profile/service";
import auth from "./utils/auth";

export const createApp = async (services?: {
	customerAuthService?: CustomerAuthService;
	customerProfileService?: CustomerProfileService;
	staffAuthService?: StaffAuthService;
	staffProfileService?: StaffProfileService;
}) => {
	const customerAuthService =
		services?.customerAuthService ?? createCustomerAuthService();
	const customerProfileService =
		services?.customerProfileService ?? createCustomerProfileService();
	const staffAuthService = services?.staffAuthService ?? createStaffAuthService();
	const staffProfileService =
		services?.staffProfileService ?? createStaffProfileService();

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
							name: "customer-profile",
							description: "Customer profile management",
						},
						{
							name: "staff-auth",
							description: "Staff authentication",
						},
						{
							name: "staff-profile",
							description: "Staff profile management",
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
		.use(
			createCustomerApp({
				customerAuthService,
				customerProfileService,
			}),
		)
		.use(
			createStaffApp({
				staffAuthService,
				staffProfileService,
			}),
		)
		.mount(auth.handler);
};

export const app = await createApp();
export type App = typeof app;
