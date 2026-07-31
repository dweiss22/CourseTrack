CREATE TABLE `accreditation_records` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`organization` text NOT NULL,
	`status` text NOT NULL,
	`expiration_date` text,
	`approval_number` text,
	`credit_hours` real DEFAULT 0 NOT NULL,
	`data_source` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `accreditation_course_idx` ON `accreditation_records` (`course_id`);--> statement-breakpoint
CREATE INDEX `accreditation_expiration_idx` ON `accreditation_records` (`expiration_date`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`previous_values_json` text,
	`new_values_json` text,
	`source` text NOT NULL,
	`reason` text,
	`correlation_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_record_idx` ON `audit_logs` (`record_type`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `course_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`owner` text,
	`due_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `flags_course_idx` ON `course_flags` (`course_id`);--> statement-breakpoint
CREATE INDEX `flags_status_priority_idx` ON `course_flags` (`status`,`priority`);--> statement-breakpoint
CREATE TABLE `course_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`version_number` text NOT NULL,
	`version_type` text NOT NULL,
	`publication_date` text,
	`is_current` integer DEFAULT false NOT NULL,
	`data_source` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `versions_course_idx` ON `course_versions` (`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`course_code` text NOT NULL,
	`lms_course_id` text,
	`title` text NOT NULL,
	`primary_vertical` text NOT NULL,
	`lifecycle_status` text NOT NULL,
	`publication_status` text NOT NULL,
	`owner` text,
	`next_review_date` text,
	`health_status` text NOT NULL,
	`health_score` integer NOT NULL,
	`metadata_completeness_score` integer NOT NULL,
	`data_source` text NOT NULL,
	`source_system` text NOT NULL,
	`retrieval_status` text NOT NULL,
	`last_retrieved_at` text,
	`internal_summary` text DEFAULT '' NOT NULL,
	`is_sample` integer DEFAULT true NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_idx` ON `courses` (`course_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `courses_lms_id_idx` ON `courses` (`lms_course_id`);--> statement-breakpoint
CREATE INDEX `courses_vertical_idx` ON `courses` (`primary_vertical`);--> statement-breakpoint
CREATE INDEX `courses_lifecycle_idx` ON `courses` (`lifecycle_status`);--> statement-breakpoint
CREATE INDEX `courses_review_date_idx` ON `courses` (`next_review_date`);--> statement-breakpoint
CREATE INDEX `courses_health_idx` ON `courses` (`health_status`);--> statement-breakpoint
CREATE TABLE `lms_retrieval_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`records_requested` integer DEFAULT 0 NOT NULL,
	`records_received` integer DEFAULT 0 NOT NULL,
	`records_failed` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`initiated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `retrieval_runs_started_idx` ON `lms_retrieval_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `lms_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`retrieval_run_id` text,
	`retrieved_at` text NOT NULL,
	`normalized_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`mapping_warnings_json` text DEFAULT '[]' NOT NULL,
	`is_current` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`retrieval_run_id`) REFERENCES `lms_retrieval_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshots_external_idx` ON `lms_snapshots` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `snapshots_course_idx` ON `lms_snapshots` (`course_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`note_type` text NOT NULL,
	`author` text NOT NULL,
	`visibility` text NOT NULL,
	`body` text NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_course_idx` ON `notes` (`course_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`primary_role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_idx` ON `profiles` (`email`);--> statement-breakpoint
CREATE TABLE `revamp_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`score` integer NOT NULL,
	`business_justification` text NOT NULL,
	`target_publication_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `revamp_course_idx` ON `revamp_proposals` (`course_id`);