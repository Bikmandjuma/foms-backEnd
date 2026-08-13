-- Replace dateOfBirth with an age-range string (e.g. "18-20"), add
-- ipName/category/personalId, and drop nationalId/householdSize.
ALTER TABLE `Beneficiary` DROP INDEX `Beneficiary_tenantId_nationalId_key`;

ALTER TABLE `Beneficiary`
  ADD COLUMN `ageRange` VARCHAR(191) NULL,
  ADD COLUMN `ipName` VARCHAR(191) NULL,
  ADD COLUMN `category` VARCHAR(191) NULL,
  ADD COLUMN `personalId` VARCHAR(191) NULL;

ALTER TABLE `Beneficiary`
  DROP COLUMN `dateOfBirth`,
  DROP COLUMN `nationalId`,
  DROP COLUMN `householdSize`;

CREATE UNIQUE INDEX `Beneficiary_tenantId_personalId_key` ON `Beneficiary`(`tenantId`, `personalId`);
