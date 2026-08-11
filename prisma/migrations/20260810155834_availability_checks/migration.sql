-- AlterTable
ALTER TABLE `Program` ADD COLUMN `checkerRoleId` VARCHAR(191) NULL;

CREATE INDEX `Program_checkerRoleId_fkey` ON `Program`(`checkerRoleId`);

ALTER TABLE `Program` ADD CONSTRAINT `Program_checkerRoleId_fkey` FOREIGN KEY (`checkerRoleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `AvailabilityCheck` (
    `id` VARCHAR(191) NOT NULL,
    `programId` VARCHAR(191) NOT NULL,
    `beneficiaryId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'AVAILABLE', 'NOT_AVAILABLE') NOT NULL DEFAULT 'PENDING',
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AvailabilityCheck_programId_beneficiaryId_key`(`programId`, `beneficiaryId`),
    INDEX `AvailabilityCheck_beneficiaryId_fkey`(`beneficiaryId`),
    INDEX `AvailabilityCheck_userId_fkey`(`userId`),
    INDEX `AvailabilityCheck_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AvailabilityCheck` ADD CONSTRAINT `AvailabilityCheck_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AvailabilityCheck` ADD CONSTRAINT `AvailabilityCheck_beneficiaryId_fkey` FOREIGN KEY (`beneficiaryId`) REFERENCES `Beneficiary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AvailabilityCheck` ADD CONSTRAINT `AvailabilityCheck_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AvailabilityCheck` ADD CONSTRAINT `AvailabilityCheck_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
