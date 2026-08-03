-- AlterTable: add cell/village to the geographic hierarchy on User
ALTER TABLE `User` ADD COLUMN `cell` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `village` VARCHAR(191) NULL;

-- AlterTable: add cell/village to the geographic hierarchy on Beneficiary
ALTER TABLE `Beneficiary` ADD COLUMN `cell` VARCHAR(191) NULL;
ALTER TABLE `Beneficiary` ADD COLUMN `village` VARCHAR(191) NULL;

-- AlterTable: replacement geo-matching
ALTER TABLE `ReplacementRequest` ADD COLUMN `matchLevel` ENUM('VILLAGE', 'CELL', 'SECTOR', 'DISTRICT', 'PROVINCE', 'OVERRIDE') NULL;
ALTER TABLE `ReplacementRequest` ADD COLUMN `overrideReason` VARCHAR(191) NULL;

-- AlterTable: field check-in additions (live GPS ping + checkout override)
ALTER TABLE `FieldCheckIn` ADD COLUMN `currentGpsLat` DOUBLE NULL;
ALTER TABLE `FieldCheckIn` ADD COLUMN `currentGpsLng` DOUBLE NULL;
ALTER TABLE `FieldCheckIn` ADD COLUMN `currentGpsAt` DATETIME(3) NULL;
ALTER TABLE `FieldCheckIn` ADD COLUMN `currentGpsNote` VARCHAR(191) NULL;
ALTER TABLE `FieldCheckIn` ADD COLUMN `checkoutOverrideReason` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `FieldVisit` (
    `id` VARCHAR(191) NOT NULL,
    `outcome` ENUM('PENDING', 'COMPLETED', 'REFUSED', 'NOT_FOUND', 'RELOCATED', 'DECEASED', 'REPLACED') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(191) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkInId` VARCHAR(191) NOT NULL,
    `beneficiaryId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `FieldVisit_checkInId_beneficiaryId_key`(`checkInId`, `beneficiaryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FieldNote` (
    `id` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkInId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FieldVisit` ADD CONSTRAINT `FieldVisit_checkInId_fkey` FOREIGN KEY (`checkInId`) REFERENCES `FieldCheckIn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FieldVisit` ADD CONSTRAINT `FieldVisit_beneficiaryId_fkey` FOREIGN KEY (`beneficiaryId`) REFERENCES `Beneficiary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldNote` ADD CONSTRAINT `FieldNote_checkInId_fkey` FOREIGN KEY (`checkInId`) REFERENCES `FieldCheckIn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
