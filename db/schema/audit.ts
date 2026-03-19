import {
	pgTable,
	uuid,
	text,
	timestamp,
	jsonb,
	index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		userId: uuid("user_id").references(() => users.id),
		entityType: text("entity_type").notNull(),
		entityId: uuid("entity_id").notNull(),
		action: text("action").notNull(),
		changes: jsonb("changes").default({}),
		metadata: jsonb("metadata").default({}),
		ipAddress: text("ip_address"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("idx_audit_org").on(table.organizationId),
		index("idx_audit_entity").on(table.entityType, table.entityId),
		index("idx_audit_user").on(table.userId),
		index("idx_audit_date").on(table.createdAt),
		index("idx_audit_org_entity_date").on(
			table.organizationId,
			table.entityType,
			table.createdAt,
		),
	],
);
