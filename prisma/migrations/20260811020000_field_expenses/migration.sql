-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM(
    'ASSIGNMENT_PROGRAM',
    'ASSIGNMENT_BENEFICIARY',
    'REPLACEMENT_REQUESTED',
    'REPLACEMENT_DECIDED',
    'EXPENSE_REVIEWED',
    'SYSTEM'
) NOT NULL;

-- CreateTable
CREATE TABLE `FieldExpense` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `programId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `documentUrl` VARCHAR(191) NULL,
    `expenseDate` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNotes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FieldExpense_tenantId_fkey`(`tenantId`),
    INDEX `FieldExpense_userId_fkey`(`userId`),
    INDEX `FieldExpense_programId_fkey`(`programId`),
    INDEX `FieldExpense_reviewedById_fkey`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FieldExpense` ADD CONSTRAINT `FieldExpense_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FieldExpense` ADD CONSTRAINT `FieldExpense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FieldExpense` ADD CONSTRAINT `FieldExpense_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FieldExpense` ADD CONSTRAINT `FieldExpense_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
