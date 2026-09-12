import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
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
		deletedAt: timestamp("deleted_at"),
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

export const staffRoleEnum = pgEnum("staff_role", ["admin", "operations"]);

export const assetTypeEnum = pgEnum("asset_type", ["document", "image"]);

export const assetStatusEnum = pgEnum("asset_status", [
	"uploading",
	"uploaded",
	"processing",
	"ready",
	"failed",
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
		role: staffRoleEnum("role").default("operations").notNull(),
		status: staffStatusEnum("status").default("active").notNull(),
	},
	(table) => [
		index("staff_user_id_idx").on(table.userId),
		index("staff_public_id_idx").on(table.publicId),
		index("staff_status_idx").on(table.status),
		index("staff_role_idx").on(table.role),
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

export const asset = pgTable(
	"asset",
	{
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		assetType: assetTypeEnum("asset_type").notNull(),
		status: assetStatusEnum("status").default("uploading").notNull(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		storageUrl: text("storage_url").notNull(),
		rawKey: text("raw_key"),
		mimeType: text("mime_type"),
		fileSize: integer("file_size"),
		processedSize: integer("processed_size"),
		origWidth: integer("orig_width"),
		origHeight: integer("orig_height"),
		processingStartedAt: timestamp("processing_started_at", {
			withTimezone: true,
		}),
		processingFinishedAt: timestamp("processing_finished_at", {
			withTimezone: true,
		}),
		processingError: text("processing_error"),
		attempts: integer("attempts").default(1).notNull(),
	},
	(table) => [
		index("asset_status_idx").on(table.status),
		index("asset_type_idx").on(table.assetType),
		index("asset_owner_idx").on(table.ownerId),
	],
);

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
	"staff",
	"customer",
	"system",
]);

export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid("id").primaryKey(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		actorType: auditActorTypeEnum("actor_type").notNull(),
		actorId: text("actor_id").notNull(),
		action: text("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		metadata: jsonb("metadata"),
	},
	(table) => [
		index("audit_log_entity_idx").on(table.entityType, table.entityId),
		index("audit_log_actor_idx").on(table.actorType, table.actorId),
	],
);

export const assetRelations = relations(asset, ({ one }) => ({
	owner: one(user, {
		fields: [asset.ownerId],
		references: [user.id],
	}),
}));
