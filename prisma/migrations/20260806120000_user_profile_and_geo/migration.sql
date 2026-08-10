-- AlterTable: User gains split name fields and a profile photo
ALTER TABLE `User` ADD COLUMN `firstName` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `lastName` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `avatarUrl` VARCHAR(191) NULL;

-- CreateTable: forgot-password 6-digit codes
CREATE TABLE `PasswordResetCode` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Rwanda administrative hierarchy (cascading location selects)
CREATE TABLE `AdminLocation` (
    `id` VARCHAR(191) NOT NULL,
    `province` VARCHAR(100) NOT NULL,
    `district` VARCHAR(100) NOT NULL,
    `sector` VARCHAR(100) NOT NULL,
    `cell` VARCHAR(100) NOT NULL,
    `village` VARCHAR(100) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `AdminLocation_full_path_key` ON `AdminLocation`(`province`, `district`, `sector`, `cell`, `village`);

-- CreateIndex
CREATE INDEX `AdminLocation_province_idx` ON `AdminLocation`(`province`);

-- CreateIndex
CREATE INDEX `AdminLocation_province_district_idx` ON `AdminLocation`(`province`, `district`);

-- CreateIndex
CREATE INDEX `AdminLocation_pds_idx` ON `AdminLocation`(`province`, `district`, `sector`);

-- CreateIndex
CREATE INDEX `AdminLocation_pdsc_idx` ON `AdminLocation`(`province`, `district`, `sector`, `cell`);

-- AddForeignKey
ALTER TABLE `PasswordResetCode` ADD CONSTRAINT `PasswordResetCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
