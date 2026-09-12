import { describe, expect, it } from "bun:test";
import {
	buildForwardedRequest,
	extractErrorMessage,
	getSetCookieHeader,
	readErrorBody,
} from "@api/lib/auth-forward";

describe("auth-forward", () => {
	it("forwards cookies and JSON body", () => {
		const req = new Request("http://localhost/v1/app/customer/auth/login", {
			method: "POST",
			headers: { cookie: "session=abc", "user-agent": "test" },
		});
		const forwarded = buildForwardedRequest(
			"/api/auth/sign-in/email",
			{ email: "a@example.com" },
			req,
		);
		expect(forwarded.url).toContain("/api/auth/sign-in/email");
		expect(forwarded.headers.get("cookie")).toBe("session=abc");
	});

	it("extracts error message with defaults", () => {
		expect(extractErrorMessage(401, {})).toMatchObject({
			status: 401,
			code: "AUTH_ERROR",
		});
		expect(
			extractErrorMessage(400, { code: "X", message: "bad" }).message,
		).toBe("bad");
	});

	it("reads set-cookie header", () => {
		const res = new Response("{}", {
			headers: { "set-cookie": "a=b" },
		});
		expect(getSetCookieHeader(res)).toContain("a=b");
	});

	it("reads error body safely", async () => {
		expect(await readErrorBody(new Response("not-json"))).toEqual({});
		expect(
			await readErrorBody(
				new Response(JSON.stringify({ code: "E" })),
			),
		).toMatchObject({ code: "E" });
	});
});
