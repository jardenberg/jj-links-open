import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const inventoryCache = sqliteTable("inventory_cache", {
  id: text("id").primaryKey(),
  payloadJson: text("payload_json").notNull(),
  itemCount: integer("item_count").notNull(),
  syncedAt: text("synced_at").notNull(),
});

export const analyticsDaily = sqliteTable(
  "analytics_daily",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    sourceUrl: text("source_url").notNull(),
    host: text("host").notNull(),
    path: text("path").notNull(),
    requests: integer("requests").notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (table) => [uniqueIndex("analytics_daily_date_source").on(table.date, table.sourceUrl)],
);

export const configSnapshots = sqliteTable("config_snapshots", {
  id: text("id").primaryKey(),
  itemCount: integer("item_count").notNull(),
  sha256: text("sha256").notNull(),
  payloadJson: text("payload_json").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  actorId: text("actor_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  sourceUrl: text("source_url").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  operationId: text("operation_id"),
  verificationJson: text("verification_json"),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: text("created_at").notNull(),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  rows: integer("rows").notNull().default(0),
  windowStart: text("window_start"),
  windowEnd: text("window_end"),
  error: text("error"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
});

export const linkMetadata = sqliteTable("link_metadata", {
  sourceUrl: text("source_url").primaryKey(),
  label: text("label"),
  tagsJson: text("tags_json").notNull().default("[]"),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull(),
});

export const writeRequests = sqliteTable("write_requests", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  state: text("state").notNull(),
  lockKey: text("lock_key").unique(),
  expectedJson: text("expected_json"),
  responseJson: text("response_json"),
  createdAt: text("created_at").notNull(),
});

export const importPreviews = sqliteTable("import_previews", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  mode: text("mode").notNull(),
  baselineJson: text("baseline_json").notNull(),
  candidateJson: text("candidate_json").notNull(),
  changesJson: text("changes_json").notNull(),
  verificationJson: text("verification_json").notNull().default("{}"),
  state: text("state").notNull().default("preview"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  zoneId: text("zone_id").notNull(),
  listId: text("list_id").notNull(),
  rulesetId: text("ruleset_id").notNull(),
});
