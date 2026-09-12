export function buildForwardedRequest(
	path: string,
	input: Record<string, unknown>,
	request: Request,
	method: "GET" | "POST" = "POST",
): Request {
	const url = new URL(path, request.url);
	const headers = new Headers({
		"content-type": "application/json",
	});

	for (const key of [
		"cookie",
		"origin",
		"user-agent",
		"x-forwarded-for",
		"x-forwarded-host",
		"x-forwarded-proto",
	] as const) {
		const value = request.headers.get(key);
		if (value) headers.set(key, value);
	}

	const init: RequestInit = { method, headers };
	if (method !== "GET") init.body = JSON.stringify(input);
	return new Request(url.href, init);
}

export function getSetCookieHeader(response: Response): string | null {
	const cookies = response.headers.getSetCookie?.();
	if (cookies && cookies.length > 0) return cookies.join(", ");
	return response.headers.get("set-cookie");
}

export async function readErrorBody(
	response: Response,
): Promise<Record<string, unknown>> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
}

export function extractErrorMessage(
	status: number,
	err: Record<string, unknown>,
): { status: number; code: string; message: string } {
	return {
		status,
		code: (err.code as string) ?? "AUTH_ERROR",
		message: (err.message as string) ?? "Authentication failed",
	};
}
