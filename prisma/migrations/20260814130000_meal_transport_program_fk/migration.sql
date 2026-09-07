-- Project becomes a real, existing Program — confirmed/selected by
-- whoever manages the config — instead of free text the report-filler
-- could type themselves.

ALTER TABLE `MealTransportReportConfig` ADD COLUMN `programId` VARCHAR(191) NULL;

-- Best-effort backfill: if an existing config's free-text projectName
-- happens to match a real Program's name in the same tenant, link it.
UPDATE `MealTransportReportConfig` c
JOIN `Program` p ON p.tenantId = c.tenantId AND LOWER(p.name) = LOWER(c.projectName)
SET c.programId = p.id;

-- Anything that didn't match a real program can't be migrated
-- automatically — the whole point of this change is that the program is
-- a real, confirmed one, not free text. Remove those configs (and their
-- dependent reports, via the existing cascade) rather than leave a config
-- pointing at nothing; whoever manages it recreates it by picking a real
-- program in the updated form.
DELETE FROM `MealTransportReportConfig` WHERE `programId` IS NULL;

ALTER TABLE `MealTransportReportConfig` MODIFY `programId` VARCHAR(191) NOT NULL;
ALTER TABLE `MealTransportReportConfig` DROP COLUMN `projectName`;

ALTER TABLE `MealTransportReportConfig`
  ADD CONSTRAINT `MealTransportReportConfig_programId_fkey`
  FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
