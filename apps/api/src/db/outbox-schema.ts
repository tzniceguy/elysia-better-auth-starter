import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const outbox = pgTable(
	"outbox",
	{
		id: uuid("id").primaryKey(),
		recipient: text("recipient").notNull(),
		subject: text("subject").notNull(),
		bodyHtml: text("body_html").notNull(),
		kind: text("kind").notNull(),
		status: text("status").default("pending").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		lastError: text("last_error"),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("outbox_status_next_retry_idx").on(table.status, table.nextRetryAt),
		index("outbox_recipient_idx").on(table.recipient),
	],
);
