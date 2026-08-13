-- CreateTable
CREATE TABLE `FieldVisitOtp` (
    `id` VARCHAR(191) NOT NULL,
    `checkInId` VARCHAR(191) NOT NULL,
    `beneficiaryId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FieldVisitOtp_checkInId_beneficiaryId_idx`(`checkInId`, `beneficiaryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FieldVisitOtp` ADD CONSTRAINT `FieldVisitOtp_checkInId_fkey` FOREIGN KEY (`checkInId`) REFERENCES `FieldCheckIn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldVisitOtp` ADD CONSTRAINT `FieldVisitOtp_beneficiaryId_fkey` FOREIGN KEY (`beneficiaryId`) REFERENCES `Beneficiary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
