export type ApiMeta = { requestId: string; timestamp: string };

export type ApiSuccessResponse<T> = {
	data: T;
	meta: ApiMeta;
	error: null;
};
export type ApiErrorDetail = {
	field?: string;
	message: string;
};

export type ApiErrorResponse = {
	data: null;
	meta: ApiMeta;
	error: {
		code: string;
		message: string;
		details: ApiErrorDetail[] | null;
	};
};

const createMeta = (extra?: Record<string, unknown>): ApiMeta => ({
	requestId: crypto.randomUUID(),
	timestamp: new Date().toISOString(),
	...(extra ?? {}),
});

export const ok = <T>(data: T, extra?: Record<string, unknown>) => ({
	meta: createMeta(extra),
	data,
	error: null,
});

export const fail = (
	code: string,
	message: string,
	details?: ApiErrorResponse["error"]["details"],
	extra?: Record<string, unknown>,
) => ({
	meta: createMeta(extra),
	data: null,
	error: {
		code,
		message,
		details: details ?? null,
	},
});
