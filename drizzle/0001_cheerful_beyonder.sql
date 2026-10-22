CREATE TABLE `write_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`lock_key` text,
	`expected_json` text,
	`response_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `write_requests_lock_key_unique` ON `write_requests` (`lock_key`);