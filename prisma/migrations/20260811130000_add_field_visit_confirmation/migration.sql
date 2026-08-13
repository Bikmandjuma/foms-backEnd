-- AlterTable
ALTER TABLE `FieldVisit` ADD COLUMN `confirmationStatus` ENUM('PENDING', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `confirmedAt` DATETIME(3) NULL,
    ADD COLUMN `confirmedById` VARCHAR(191) NULL,
    ADD COLUMN `rejectionReason` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `FieldVisit_confirmedById_fkey` ON `FieldVisit`(`confirmedById`);

-- AddForeignKey
ALTER TABLE `FieldVisit` ADD CONSTRAINT `FieldVisit_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
