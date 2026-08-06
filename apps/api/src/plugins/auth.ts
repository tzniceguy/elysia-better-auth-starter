import auth from "@api/utils/auth";
import { Elysia } from "elysia";

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	principalType: string | null;
}

interface AuthSessionResponse {
	user?: {
		id?: string;
		email?: string;
		name?: string;
		principalType?: string | null;
	} | null;
}

const authApi = auth.api as unknown as {
	getSession: (input: {
		headers: Headers;
	}) => Promise<AuthSessionResponse | null>;
};

export const authPlugin = new Elysia({ name: "auth-plugin" })
	.derive({ as: "global" }, async ({ request }) => {
		const session = await authApi.getSession({ headers: request.headers });
		const sessionUser = session?.user;
		if (!sessionUser?.id || !sessionUser.email || !sessionUser.name) {
			return { user: null };
		}

		const user: AuthUser = {
			id: sessionUser.id,
			email: sessionUser.email,
			name: sessionUser.name,
			principalType: sessionUser.principalType ?? null,
		};

		return { user };
	})
	.macro({
		scope: (types: string[]) => ({
			resolve({ user, status }) {
				const principalType = user?.principalType ?? null;
				if (!user || !principalType || !types.includes(principalType)) {
					return status(403, { message: "Forbidden" });
				}
				return { user };
			},
		}),
		authenticated: (enabled: boolean) => ({
			resolve({ user, status }) {
				if (enabled && !user) {
					return status(401, { message: "Unauthorized" });
				}
				return { user };
			},
		}),
	});
