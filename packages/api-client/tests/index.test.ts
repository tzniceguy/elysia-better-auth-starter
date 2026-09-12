import { beforeEach, describe, expect, it } from "bun:test";
import {
	createApiClient,
	createMemoryStorage,
	createWebStorage,
} from "../src/index";

describe("token storage", () => {
	it("memory storage round-trips tokens", () => {
		const storage = createMemoryStorage();
		expect(storage.getItem("k")).toBeNull();
		storage.setItem("k", "t");
		expect(storage.getItem("k")).toBe("t");
		storage.removeItem("k");
		expect(storage.getItem("k")).toBeNull();
	});

	it("web storage falls back when localStorage is unavailable", () => {
		const storage = createWebStorage();
		const real = (globalThis as Record<string, unknown>).localStorage;
		try {
			delete (globalThis as Record<string, unknown>).localStorage;
			storage.setItem("k", "t");
			expect(storage.getItem("k")).toBe("t");
			storage.removeItem("k");
			expect(storage.getItem("k")).toBeNull();
		} finally {
			(globalThis as Record<string, unknown>).localStorage = real;
		}
	});

	it("token helpers never throw on broken storage", () => {
		const broken = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
			removeItem: () => {
				throw new Error("denied");
			},
		};
		const client = createApiClient({
			baseURL: "http://localhost",
			tokenKey: "k",
			storage: broken,
		});
		expect(client.getStoredToken()).toBeNull();
		expect(() => client.setStoredToken("t")).not.toThrow();
		expect(() => client.clearStoredToken()).not.toThrow();
		expect(client.buildAuthHeaders().get("authorization")).toBeNull();
	});
});

describe("auth headers", () => {
	it("attaches Bearer token and preserves existing headers", () => {
		const client = createApiClient({
			baseURL: "http://localhost",
			tokenKey: "k",
			storage: createMemoryStorage(),
		});
		expect(client.buildAuthHeaders().get("authorization")).toBeNull();
		client.setStoredToken("abc");
		const headers = client.buildAuthHeaders({ "x-a": "1" });
		expect(headers.get("authorization")).toBe("Bearer abc");
		expect(headers.get("x-a")).toBe("1");
		client.clearStoredToken();
		expect(client.buildAuthHeaders().get("authorization")).toBeNull();
	});
});

describe("handleUnauthorized", () => {
	it("calls onUnauthorized only for 401", async () => {
		let calls = 0;
		const client = createApiClient({
			baseURL: "http://localhost",
			tokenKey: "k",
			storage: createMemoryStorage(),
			onUnauthorized: () => {
				calls += 1;
			},
		});
		await client.handleUnauthorized(new Response("{}", { status: 200 }));
		expect(calls).toBe(0);
		await client.handleUnauthorized(new Response("{}", { status: 401 }));
		expect(calls).toBe(1);
	});

	it("no-ops without onUnauthorized", async () => {
		const client = createApiClient({
			baseURL: "http://localhost",
			tokenKey: "k",
			storage: createMemoryStorage(),
		});
		await client.handleUnauthorized(new Response("{}", { status: 401 }));
	});
});

describe("axiosFetcher", () => {
	let server: ReturnType<typeof Bun.serve>;
	let baseURL: string;
	let seen: { url: string; auth: string | null; method: string }[];

	beforeEach(() => {
		seen = [];
		server = Bun.serve({
			port: 0,
			fetch: (req) => {
				seen.push({
					url: req.url,
					auth: req.headers.get("authorization"),
					method: req.method,
				});
				if (req.url.endsWith("/missing")) {
					return new Response(JSON.stringify({ error: "nope" }), {
						status: 404,
						headers: { "content-type": "application/json" },
					});
				}
				return new Response(JSON.stringify({ ok: true }), {
					headers: { "content-type": "application/json" },
				});
			},
		});
		baseURL = `http://localhost:${server.port}`;
		return () => server.stop();
	});

	it("resolves HTTP error statuses like fetch", async () => {
		const client = createApiClient({
			baseURL,
			tokenKey: "k",
			storage: createMemoryStorage(),
		});
		const res = await client.axiosFetcher(`${baseURL}/missing`);
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ error: "nope" });
	});

	it("sends init headers and method through axios", async () => {
		const client = createApiClient({
			baseURL,
			tokenKey: "k",
			storage: createMemoryStorage(),
		});
		client.setStoredToken("tok");
		const withAuth = client.buildAuthHeaders();
		const res = await client.axiosFetcher(`${baseURL}/ok`, {
			method: "POST",
			headers: withAuth,
			body: JSON.stringify({ a: 1 }),
		});
		expect(res.status).toBe(200);
		expect(seen[0]?.method).toBe("POST");
		expect(seen[0]?.auth).toBe("Bearer tok");
	});
});
