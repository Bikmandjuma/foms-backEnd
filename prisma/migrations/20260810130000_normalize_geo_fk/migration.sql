-- Add the missing villageId FK (provinceId/districtId/sectorId/cellId already
-- exist on both tables with live FK constraints from a previous, pre-Prisma import).
ALTER TABLE `User` ADD COLUMN `villageId` INT NULL;
CREATE INDEX `User_villageId_fkey` ON `User`(`villageId`);

ALTER TABLE `Beneficiary` ADD COLUMN `villageId` INT NULL;
CREATE INDEX `Beneficiary_villageId_fkey` ON `Beneficiary`(`villageId`);

-- Backfill provinceId/districtId/sectorId/cellId/villageId from the current
-- province/district/sector/cell/village strings before those columns are
-- dropped below, so no location data is lost in the switch to normalized FKs.
UPDATE `User` u
JOIN `villages` v ON v.name = u.village
JOIN `cells` c ON v.cell = c.id AND c.name = u.cell
JOIN `sectors` s ON c.sector = s.id AND s.name = u.sector
JOIN `districts` d ON s.district = d.id AND d.name = u.district
JOIN `provinces` p ON d.province = p.id AND p.name = u.province
SET u.villageId = v.id, u.cellId = c.id, u.sectorId = s.id, u.districtId = d.id, u.provinceId = p.id
WHERE u.village IS NOT NULL;

UPDATE `Beneficiary` b
JOIN `villages` v ON v.name = b.village
JOIN `cells` c ON v.cell = c.id AND c.name = b.cell
JOIN `sectors` s ON c.sector = s.id AND s.name = b.sector
JOIN `districts` d ON s.district = d.id AND d.name = b.district
JOIN `provinces` p ON d.province = p.id AND p.name = b.province
SET b.villageId = v.id, b.cellId = c.id, b.sectorId = s.id, b.districtId = d.id, b.provinceId = p.id
WHERE b.village IS NOT NULL;

-- Now that the FK columns are populated, wire up the constraints.
ALTER TABLE `User` ADD CONSTRAINT `User_villageId_fkey` FOREIGN KEY (`villageId`) REFERENCES `villages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Beneficiary` ADD CONSTRAINT `Beneficiary_villageId_fkey` FOREIGN KEY (`villageId`) REFERENCES `villages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the AdminLocation relation and table: superseded by direct FKs into
-- the normalized provinces/districts/sectors/cells/villages tables above.
ALTER TABLE `User` DROP FOREIGN KEY `User_adminLocationId_fkey`;
ALTER TABLE `User` DROP COLUMN `adminLocationId`;
ALTER TABLE `Beneficiary` DROP FOREIGN KEY `Beneficiary_adminLocationId_fkey`;
ALTER TABLE `Beneficiary` DROP COLUMN `adminLocationId`;
DROP TABLE `AdminLocation`;

-- Drop the denormalized location strings: replaced by provinceId/districtId/
-- sectorId/cellId/villageId FKs.
ALTER TABLE `User` DROP COLUMN `province`;
ALTER TABLE `User` DROP COLUMN `district`;
ALTER TABLE `User` DROP COLUMN `sector`;
ALTER TABLE `User` DROP COLUMN `cell`;
ALTER TABLE `User` DROP COLUMN `village`;

ALTER TABLE `Beneficiary` DROP COLUMN `province`;
ALTER TABLE `Beneficiary` DROP COLUMN `district`;
ALTER TABLE `Beneficiary` DROP COLUMN `sector`;
ALTER TABLE `Beneficiary` DROP COLUMN `cell`;
ALTER TABLE `Beneficiary` DROP COLUMN `village`;
