import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const permission = pgTable("persmission", {
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
	resource: text("resource").notNull(),
	action: text("action").notNull(),
	description: text("description"),
});

export const role = pgTable("role", {
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
	name: text("name").notNull(),
	description: text("description"),
	isStaff: boolean("is_staff").default(false),
});

export const rolePermission = pgTable("role_persmission", {
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
	roleId: integer("role_id")
		.notNull()
		.references(() => role.id),
	permissionId: integer("permsission_id")
		.notNull()
		.references(() => permission.id),
});

export const userRole = pgTable("user_role", {
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id),
	roleId: integer("role_id")
		.notNull()
		.references(() => role.id),
});
