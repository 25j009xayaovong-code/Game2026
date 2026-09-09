CREATE TABLE `room_pickups` (
	`room_code` text NOT NULL,
	`pickup_id` integer NOT NULL,
	`type` text NOT NULL,
	`collected_by` text NOT NULL,
	`collected_at` integer NOT NULL,
	PRIMARY KEY(`room_code`, `pickup_id`),
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `room_players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`token` text NOT NULL,
	`name` text NOT NULL,
	`appearance` text NOT NULL,
	`x` integer DEFAULT 0 NOT NULL,
	`y` integer DEFAULT 0 NOT NULL,
	`z` integer DEFAULT 9000 NOT NULL,
	`rotation` integer DEFAULT 0 NOT NULL,
	`pose` text DEFAULT 'idle' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`scrap` integer DEFAULT 0 NOT NULL,
	`cells` integer DEFAULT 0 NOT NULL,
	`won` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
