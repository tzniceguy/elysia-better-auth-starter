import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
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

export const staffStatusEnum = pgEnum("staff_status", [
	"active",
	"suspended",
	"deleted",
]);

export const staff = pgTable(
	"staff",
	{
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		id: text("id").primaryKey(),
		publicId: text("public_id").notNull().unique(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		fullName: text("full_name").notNull(),
		phoneNumber: text("phone_number").notNull(),
		avatarUrl: text("avatar_url"),
		status: staffStatusEnum("status").default("active").notNull(),
	},
	(table) => [
		index("staff_user_id_idx").on(table.userId),
		index("staff_public_id_idx").on(table.publicId),
		index("staff_status_idx").on(table.status),
	],
);

export const customerRelations = relations(customer, ({ one }) => ({
	user: one(user, {
		fields: [customer.userId],
		references: [user.id],
	}),
}));

export const staffRelations = relations(staff, ({ one }) => ({
	user: one(user, {
		fields: [staff.userId],
		references: [user.id],
	}),
}));
