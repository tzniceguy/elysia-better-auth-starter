import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import logixlysia from "logixlysia";
import { customerApp } from "./modules/customer";
import { staffApp } from "./modules/staff";
import auth from "./utils/auth";

const MAX_REQUEST_BODY_SIZE = 5 * 1024 * 1024;

export const createApp = async () => {
	return new Elysia({ serve: { maxRequestBodySize: MAX_REQUEST_BODY_SIZE } })
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
						title: "Platform API",
						version: "0.0.0",
						description: "Shared backend API for customer and staff clients.",
					},
					tags: [
						{ name: "system", description: "System and health endpoints" },
						{ name: "better-auth", description: "Better Auth endpoints" },
					],
				},
			}),
		)
		.get(
			"/",
			() => ({
				name: "platform-api",
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
				name: "platform-api",
				status: "ok",
			}),
			{
				detail: {
					tags: ["system"],
					summary: "Health check",
				},
			},
		)
		.use(customerApp())
		.use(staffApp())
		.mount(auth.handler);
};

export const app = await createApp();
export type App = typeof app;
