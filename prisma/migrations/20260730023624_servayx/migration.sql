-- AlterTable
ALTER TABLE `Beneficiary` ADD COLUMN `consentAt` DATETIME(3) NULL,
    ADD COLUMN `consentGiven` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `outcome` ENUM('PENDING', 'COMPLETED', 'REFUSED', 'NOT_FOUND', 'RELOCATED', 'DECEASED', 'REPLACED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `program` ADD COLUMN `endDate` DATETIME(3) NULL,
    ADD COLUMN `scenarioType` ENUM('BASELINE_SURVEY', 'ENDLINE_SURVEY', 'TRACER_STUDY', 'PROGRAM_OUTCOME_ASSESSMENT', 'QUALITATIVE_STUDY') NULL,
    ADD COLUMN `startDate` DATETIME(3) NULL,
    ADD COLUMN `status` ENUM('PLANNING', 'FIELDWORK', 'DATA_CLEANING', 'REPORTING', 'COMPLETED') NOT NULL DEFAULT 'PLANNING',
    ADD COLUMN `targetSampleSize` INTEGER NULL;

-- AlterTable
ALTER TABLE `role` ADD COLUMN `permissions` JSON NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `lastSeenAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('ASSIGNMENT_PROGRAM', 'ASSIGNMENT_BENEFICIARY', 'REPLACEMENT_REQUESTED', 'REPLACEMENT_DECIDED', 'SYSTEM') NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenantId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReplacementRequest` (
    `id` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `originalRespondentId` VARCHAR(191) NOT NULL,
    `candidateRespondentId` VARCHAR(191) NULL,
    `requestedByUserId` VARCHAR(191) NOT NULL,
    `decidedByUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FieldCheckIn` (
    `id` VARCHAR(191) NOT NULL,
    `checkInAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkOutAt` DATETIME(3) NULL,
    `gpsLat` DOUBLE NULL,
    `gpsLng` DOUBLE NULL,
    `note` VARCHAR(191) NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenantId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReplacementRequest` ADD CONSTRAINT `ReplacementRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReplacementRequest` ADD CONSTRAINT `ReplacementRequest_originalRespondentId_fkey` FOREIGN KEY (`originalRespondentId`) REFERENCES `Beneficiary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReplacementRequest` ADD CONSTRAINT `ReplacementRequest_candidateRespondentId_fkey` FOREIGN KEY (`candidateRespondentId`) REFERENCES `Beneficiary`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReplacementRequest` ADD CONSTRAINT `ReplacementRequest_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReplacementRequest` ADD CONSTRAINT `ReplacementRequest_decidedByUserId_fkey` FOREIGN KEY (`decidedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldCheckIn` ADD CONSTRAINT `FieldCheckIn_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldCheckIn` ADD CONSTRAINT `FieldCheckIn_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FieldCheckIn` ADD CONSTRAINT `FieldCheckIn_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Program`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
