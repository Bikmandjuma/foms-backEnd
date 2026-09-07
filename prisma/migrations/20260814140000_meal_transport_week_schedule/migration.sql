-- Reporting periods become an admin-scheduled list of weeks per program
-- (each its own From/To dates, not an automatic recurring cadence) rather
-- than something auto-computed per user. Existing reports are preserved:
-- a real Week row is created from each one's own dates and enabled, so
-- already-submitted reports keep working exactly as they did.

CREATE TABLE `MealTransportReportWeek` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `programId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `weekStart` DATETIME(3) NOT NULL,
  `weekEnd` DATETIME(3) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MealTransportReportWeek_programId_label_key`(`programId`, `label`),
  INDEX `MealTransportReportWeek_tenantId_fkey`(`tenantId`)
);

ALTER TABLE `MealTransportReportWeek`
  ADD CONSTRAINT `MealTransportReportWeek_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `MealTransportReportWeek_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- One real, enabled Week per existing report, using that report's own
-- config to find the program and its own dates and week number for the
-- label, so nothing already submitted loses its place.
INSERT INTO `MealTransportReportWeek` (`id`, `tenantId`, `programId`, `label`, `weekStart`, `weekEnd`, `enabled`, `createdAt`, `updatedAt`)
SELECT
  UUID(),
  r.`tenantId`,
  c.`programId`,
  CONCAT('Week ', r.`weekNumber`),
  r.`weekStart`,
  r.`weekEnd`,
  true,
  r.`createdAt`,
  r.`createdAt`
FROM `MealTransportReport` r
JOIN `MealTransportReportConfig` c ON c.`id` = r.`configId`;

ALTER TABLE `MealTransportReport` ADD COLUMN `weekId` VARCHAR(191) NULL;

UPDATE `MealTransportReport` r
JOIN `MealTransportReportConfig` c ON c.`id` = r.`configId`
JOIN `MealTransportReportWeek` w ON w.`programId` = c.`programId` AND w.`label` = CONCAT('Week ', r.`weekNumber`)
SET r.`weekId` = w.`id`;

ALTER TABLE `MealTransportReport` MODIFY `weekId` VARCHAR(191) NOT NULL;
ALTER TABLE `MealTransportReport` DROP COLUMN `weekNumber`;
ALTER TABLE `MealTransportReport` DROP COLUMN `weekStart`;
ALTER TABLE `MealTransportReport` DROP COLUMN `weekEnd`;

ALTER TABLE `MealTransportReport` DROP INDEX `MealTransportReport_userId_weekNumber_key`;
CREATE UNIQUE INDEX `MealTransportReport_userId_weekId_key` ON `MealTransportReport`(`userId`, `weekId`);
CREATE INDEX `MealTransportReport_weekId_fkey` ON `MealTransportReport`(`weekId`);

ALTER TABLE `MealTransportReport`
  ADD CONSTRAINT `MealTransportReport_weekId_fkey` FOREIGN KEY (`weekId`) REFERENCES `MealTransportReportWeek`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Report periods are now scheduled per week, not a per-config cadence.
ALTER TABLE `MealTransportReportConfig` DROP COLUMN `periodDays`;
