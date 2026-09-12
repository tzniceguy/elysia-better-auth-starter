import type { App } from "@api/app";
import { treaty } from "@elysiajs/eden";
import {
	axiosFetcher,
	buildAuthHeaders,
	handleUnauthorized,
} from "./api-client";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

function attachAuth(
	_path: string,
	options: RequestInit,
): RequestInit | undefined {
	const headers = buildAuthHeaders(options.headers);
	if (!headers.get("authorization")) return;
	return { ...options, headers };
}

export const api = treaty<App>(API_URL, {
	fetcher: axiosFetcher as typeof fetch,
	fetch: { credentials: "include" },
	onRequest: attachAuth,
	onResponse: handleUnauthorized,
});
