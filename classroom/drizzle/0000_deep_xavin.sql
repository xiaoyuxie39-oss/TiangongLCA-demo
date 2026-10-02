CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`label` text NOT NULL,
	`label_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_token_hash_unique` ON `groups` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `groups_session_label_key_unique` ON `groups` (`session_id`,`label_key`);--> statement-breakpoint
CREATE TABLE `responses` (
	`group_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`baseline_sve_t` real NOT NULL,
	`baseline_biopile_t` real NOT NULL,
	`provider_uuid` text NOT NULL,
	`changed_sve_t` real NOT NULL,
	`changed_biopile_t` real NOT NULL,
	`gac_reason` text NOT NULL,
	`cutoff_choice` text NOT NULL,
	`explanation` text NOT NULL,
	`snapshot` text NOT NULL,
	`method_uuid` text NOT NULL,
	`electricity_flow_uuid` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`submitted_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `responses_session_idx` ON `responses` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`expected_groups` integer NOT NULL,
	`phase` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "sessions_phase_check" CHECK("sessions"."phase" IN ('open', 'locked', 'revealed', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_code_unique` ON `sessions` (`code`);