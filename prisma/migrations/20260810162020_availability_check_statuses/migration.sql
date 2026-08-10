-- AlterTable: replace the placeholder AVAILABLE/NOT_AVAILABLE pair with the
-- app's established field-visit outcome vocabulary. Table is still empty
-- (feature not yet exercised), so this is a free rename, not a data migration.
ALTER TABLE `AvailabilityCheck`
  MODIFY COLUMN `status` ENUM('PENDING', 'AVAILABLE', 'REFUSED', 'NOT_FOUND', 'RELOCATED', 'DECEASED') NOT NULL DEFAULT 'PENDING';

ALTER TABLE `AvailabilityCheck` ADD COLUMN `notes` VARCHAR(191) NULL;
