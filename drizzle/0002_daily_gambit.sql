CREATE TABLE `import_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`mode` text NOT NULL,
	`baseline_json` text NOT NULL,
	`candidate_json` text NOT NULL,
	`changes_json` text NOT NULL,
	`verification_json` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'preview' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
