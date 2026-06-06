import { createApp } from "./app";
import { env } from "./env";

const app = await createApp();

app.listen({
	port: env.PORT,
	hostname: "0.0.0.0",
});
