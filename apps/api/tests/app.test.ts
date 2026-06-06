import { describe, expect, it } from "bun:test";
import { env } from "@api/env";

describe("app", () => {
	it("has valid environment", () => {
		expect(env.PORT).toBe("8080");
	});
});
