import { createApiClient, createWebStorage } from "@repo/api-client";
import { env } from "#/env";

const TOKEN_KEY = "customer-token";

const client = createApiClient({
	baseURL: env.VITE_API_URL,
	tokenKey: TOKEN_KEY,
	storage: createWebStorage(),
	onUnauthorized: () => {
		client.clearStoredToken();
	},
});

export const apiClient = client.apiClient;
export const axiosFetcher = client.axiosFetcher;
export const getStoredToken = client.getStoredToken;
export const setStoredToken = client.setStoredToken;
export const clearStoredToken = client.clearStoredToken;
export const buildAuthHeaders = client.buildAuthHeaders;
export const handleUnauthorized = client.handleUnauthorized;
