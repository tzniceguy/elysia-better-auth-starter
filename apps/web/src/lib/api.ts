import type { App } from "@api/app";
import { treaty } from "@elysiajs/eden";
import { env } from "#/env";
import {
	axiosFetcher,
	buildAuthHeaders,
	handleUnauthorized,
} from "#/util/api-client";

function attachAuth(
	_path: string,
	options: RequestInit,
): RequestInit | undefined {
	const headers = buildAuthHeaders(options.headers);
	if (!headers.get("authorization")) return;
	return { ...options, headers };
}

export const api = treaty<App>(env.VITE_API_URL, {
	fetcher: axiosFetcher as typeof fetch,
	fetch: { credentials: "include" },
	onRequest: attachAuth,
	onResponse: handleUnauthorized,
});
