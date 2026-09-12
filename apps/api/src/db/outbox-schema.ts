import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const outboxStatusEnum = pgEnum("outbox_status", [
	"pending",
	"completed",
	"failed",
]);

export const outboxEvent = pgTable(
	"outbox_event",
	{
		id: uuid("id").primaryKey(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		eventType: text("event_type").notNull(),
		resourceId: text("resource_id").notNull(),
		status: outboxStatusEnum("status").default("pending").notNull(),
		payload: jsonb("payload").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		lastError: text("last_error"),
		nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
	},
	(table) => [
		index("outbox_event_status_idx").on(table.status),
		index("outbox_event_resource_idx").on(table.eventType, table.resourceId),
	],
);
