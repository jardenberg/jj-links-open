CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`list_id` text NOT NULL,
	`ruleset_id` text NOT NULL
);
