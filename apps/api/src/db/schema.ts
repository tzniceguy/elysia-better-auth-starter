import { relations } from "drizzle-orm";
import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	doublePrecision,
	index,
} from "drizzle-orm/pg-core";

export {
	account,
	accountRelations,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "./auth-schema";

import { user } from "./auth-schema";

export const customer = pgTable(
	"customer",
	{
		id: text("id").primaryKey(),
		publicId: text("public_id").notNull().unique(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		fullName: text("full_name").notNull(),
		phoneNumber: text("phone_number").notNull(),
		avatarUrl: text("avatar_url"),
		totalRides: integer("total_rides").default(0).notNull(),
		status: text("status").default("active").notNull(),
		pushEnabled: boolean("push_enabled").default(true).notNull(),
		promotionalEnabled: boolean("promotional_enabled").default(false).notNull(),
		lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
		registeredAt: timestamp("registered_at").defaultNow().notNull(),
	},
	(table) => [
		index("customer_user_id_idx").on(table.userId),
		index("customer_public_id_idx").on(table.publicId),
	],
);

export const driver = pgTable(
	"driver",
	{
		id: text("id").primaryKey(),
		publicId: text("public_id").notNull().unique(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		fullName: text("full_name").notNull(),
		phoneNumber: text("phone_number").notNull(),
		vehicleType: text("vehicle_type").notNull(),
		licenseNumber: text("license_number").notNull(),
		avatarUrl: text("avatar_url"),
		deliveryCount: integer("delivery_count").default(0).notNull(),
		ratingAverage: doublePrecision("rating_average").default(0).notNull(),
		availability: text("availability").default("offline").notNull(),
		status: text("status").default("pending").notNull(),
		currentLat: doublePrecision("current_lat"),
		currentLng: doublePrecision("current_lng"),
		locationUpdatedAt: timestamp("location_updated_at"),
	},
	(table) => [
		index("driver_user_id_idx").on(table.userId),
		index("driver_public_id_idx").on(table.publicId),
	],
);

export const customerRelations = relations(customer, ({ one }) => ({
	user: one(user, {
		fields: [customer.userId],
		references: [user.id],
	}),
}));

export const driverRelations = relations(driver, ({ one }) => ({
	user: one(user, {
		fields: [driver.userId],
		references: [user.id],
	}),
}));
