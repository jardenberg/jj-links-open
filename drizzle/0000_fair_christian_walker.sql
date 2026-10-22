CREATE TABLE `analytics_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`source_url` text NOT NULL,
	`host` text NOT NULL,
	`path` text NOT NULL,
	`requests` integer NOT NULL,
	`observed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_daily_date_source` ON `analytics_daily` (`date`,`source_url`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`source_url` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`operation_id` text,
	`verification_json` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_request_id_unique` ON `audit_events` (`request_id`);--> statement-breakpoint
CREATE TABLE `config_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`item_count` integer NOT NULL,
	`sha256` text NOT NULL,
	`payload_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`item_count` integer NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `link_metadata` (
	`source_url` text PRIMARY KEY NOT NULL,
	`label` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`rows` integer DEFAULT 0 NOT NULL,
	`window_start` text,
	`window_end` text,
	`error` text,
	`started_at` text NOT NULL,
	`completed_at` text
);
