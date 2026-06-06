export function ok<T>(data: T) {
	return { data, meta: {}, error: null };
}

export function fail(
	code: string,
	message: string,
	details?: { field?: string; message: string }[],
) {
	return {
		data: null,
		meta: {},
		error: { code, message, details: details ?? null },
	};
}
