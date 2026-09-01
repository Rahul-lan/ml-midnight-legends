CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`size` int NOT NULL,
	`mimeType` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`shareToken` varchar(64),
	CONSTRAINT `files_id` PRIMARY KEY(`id`),
	CONSTRAINT `files_storageKey_unique` UNIQUE(`storageKey`),
	CONSTRAINT `files_shareToken_unique` UNIQUE(`shareToken`)
);
