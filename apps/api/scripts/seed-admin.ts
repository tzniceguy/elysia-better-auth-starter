import { db } from "@api/db";
import { staff, user } from "@api/db/schema";
import auth from "@api/utils/auth";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const ADMIN_EMAIL = "admin@example.local";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Platform Admin";
const ADMIN_PHONE = "+255700000000";

async function main() {
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, ADMIN_EMAIL))
		.limit(1);

	if (existing) {
		console.log(`Admin already exists (${ADMIN_EMAIL}), skipping.`);
		process.exit(0);
	}

	try {
		const signedUp = await auth.api.signUpEmail({
			body: {
				name: ADMIN_NAME,
				email: ADMIN_EMAIL,
				password: ADMIN_PASSWORD,
				principalType: "staff",
			},
			headers: new Headers(),
		});
		const userId = signedUp.user.id;

		await db
			.update(user)
			.set({ staffRole: "admin" })
			.where(eq(user.id, userId));

		const [row] = await db
			.insert(staff)
			.values({
				id: nanoid(),
				publicId: `stf_${nanoid(12)}`,
				userId,
				fullName: ADMIN_NAME,
				phoneNumber: ADMIN_PHONE,
				role: "admin",
				status: "active",
			})
			.returning();

		if (!row) {
			await db.delete(user).where(eq(user.id, userId));
			throw new Error("Failed to create staff profile for admin.");
		}

		console.log(`Admin seeded (${ADMIN_EMAIL}).`);
		process.exit(0);
	} catch (err) {
		console.error("Failed to seed admin:", err);
		process.exit(1);
	}
}

await main();
