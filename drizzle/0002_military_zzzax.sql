CREATE TABLE `user_api_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`iv` text NOT NULL,
	`updated_at` text NOT NULL
);
