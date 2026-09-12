import { createApiClient, createMemoryStorage } from "@repo/api-client";

/**
 * Shared axios-backed API transport for the native app.
 *
 * Token storage defaults to memory. For production, swap
 * `createMemoryStorage()` for an `expo-secure-store` backed
 * `TokenStorage` and keep the rest of this file unchanged.
 */
const TOKEN_KEY = "customer-token";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

const client = createApiClient({
	baseURL: API_URL,
	tokenKey: TOKEN_KEY,
	storage: createMemoryStorage(),
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
