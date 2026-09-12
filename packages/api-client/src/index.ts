import axios, { type AxiosInstance } from "axios";

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface TokenStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Browser storage guarded for SSR / private mode. Falls back to no-op
 * when `localStorage` is unavailable — cookie auth still covers requests.
 */
export function createWebStorage(): TokenStorage {
	const memory = new Map<string, string>();
	function native(): Storage | null {
		try {
			if (typeof localStorage === "undefined") return null;
			return localStorage;
		} catch {
			return null;
		}
	}
	return {
		getItem: (key) => {
			const store = native();
			try {
				if (store) return store.getItem(key);
			} catch {
				// fall through to memory
			}
			return memory.get(key) ?? null;
		},
		setItem: (key, value) => {
			const store = native();
			try {
				if (store) {
					store.setItem(key, value);
					return;
				}
			} catch {
				// fall through to memory
			}
			memory.set(key, value);
		},
		removeItem: (key) => {
			const store = native();
			try {
				if (store) store.removeItem(key);
			} catch {
				// ignore storage errors
			}
			memory.delete(key);
		},
	};
}

/** Non-persistent storage for native apps or tests. */
export function createMemoryStorage(): TokenStorage {
	const memory = new Map<string, string>();
	return {
		getItem: (key) => memory.get(key) ?? null,
		setItem: (key, value) => {
			memory.set(key, value);
		},
		removeItem: (key) => {
			memory.delete(key);
		},
	};
}

export interface ApiClientOptions {
	baseURL: string;
	tokenKey: string;
	storage?: TokenStorage;
	timeout?: number;
	/** Called with every 401 response (e.g. invalidate session queries). */
	onUnauthorized?: () => void | Promise<void>;
}

export interface CreatedApiClient {
	apiClient: AxiosInstance;
	axiosFetcher: (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => Promise<Response>;
	getStoredToken: () => string | null;
	setStoredToken: (token: string) => void;
	clearStoredToken: () => void;
	/** Returns request headers with `Authorization` attached when a token exists. */
	buildAuthHeaders: (headers?: HeadersInit) => Headers;
	/** Runs `onUnauthorized` for 401 responses. For treaty's `onResponse`. */
	handleUnauthorized: (response: Response) => Promise<void>;
}

function toWebHeaders(headers: unknown): Headers {
	const webHeaders = new Headers();
	if (!headers || typeof headers !== "object") return webHeaders;
	const record =
		typeof (headers as { toJSON?: unknown }).toJSON === "function"
			? (headers as { toJSON: () => Record<string, unknown> }).toJSON()
			: (headers as Record<string, unknown>);
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined || value === null) continue;
		webHeaders.append(
			key,
			Array.isArray(value) ? value.map(String).join(", ") : String(value),
		);
	}
	return webHeaders;
}

function toWebResponse(
	status: number,
	statusText: string | undefined,
	headers: unknown,
	data: ArrayBuffer,
): Response {
	return new Response(data, {
		status,
		statusText,
		headers: toWebHeaders(headers),
	});
}

export function createApiClient(options: ApiClientOptions): CreatedApiClient {
	const storage = options.storage ?? createWebStorage();
	const { tokenKey, onUnauthorized } = options;

	const apiClient = axios.create({
		baseURL: options.baseURL,
		withCredentials: true,
		timeout: options.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
	});

	function getStoredToken(): string | null {
		try {
			return storage.getItem(tokenKey);
		} catch {
			return null;
		}
	}

	function setStoredToken(token: string): void {
		try {
			storage.setItem(tokenKey, token);
		} catch {
			// Storage unavailable; cookies still auth requests.
		}
	}

	function clearStoredToken(): void {
		try {
			storage.removeItem(tokenKey);
		} catch {
			// Ignore storage errors.
		}
	}

	function buildAuthHeaders(headers?: HeadersInit): Headers {
		const result = new Headers(headers);
		const token = getStoredToken();
		if (token) result.set("Authorization", `Bearer ${token}`);
		return result;
	}

	async function handleUnauthorized(response: Response): Promise<void> {
		if (response.status !== 401 || !onUnauthorized) return;
		await onUnauthorized();
	}

	/**
	 * `fetch`-compatible transport backed by axios, for use as Eden treaty's
	 * `fetcher`. Always resolves with a standard `Response` (HTTP error
	 * statuses included, like native fetch) so treaty's `{ data, error }`
	 * contract is preserved. Only network failures, timeouts, and aborts
	 * reject — same as fetch.
	 */
	async function axiosFetcher(
		input: RequestInfo | URL,
		init: RequestInit = {},
	): Promise<Response> {
		const request = input instanceof Request ? input : undefined;
		const url = request ? request.url : String(input);
		const headers: Record<string, string> = {};
		new Headers(init.headers ?? request?.headers).forEach((value, key) => {
			headers[key] = value;
		});
		const response = await apiClient.request<ArrayBuffer>({
			url,
			method: init.method ?? request?.method ?? "GET",
			headers,
			data: init.body ?? undefined,
			signal: init.signal ?? undefined,
			responseType: "arraybuffer",
			validateStatus: () => true,
		});
		return toWebResponse(
			response.status,
			response.statusText,
			response.headers,
			response.data,
		);
	}

	return {
		apiClient,
		axiosFetcher,
		getStoredToken,
		setStoredToken,
		clearStoredToken,
		buildAuthHeaders,
		handleUnauthorized,
	};
}
