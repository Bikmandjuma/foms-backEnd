-- AlterTable: restore province/district/sector as plain strings on User
-- (schema drift: these columns existed in the init migration but were removed
-- outside of Prisma's migration history when provinceId/districtId/sectorId/cellId
-- FK columns were added; current code uses the flat string columns, not the FKs)
ALTER TABLE `User` ADD COLUMN `province` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `district` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `sector` VARCHAR(191) NULL;

-- AlterTable: restore province/district/sector as plain strings on Beneficiary
ALTER TABLE `Beneficiary` ADD COLUMN `province` VARCHAR(191) NULL;
ALTER TABLE `Beneficiary` ADD COLUMN `district` VARCHAR(191) NULL;
ALTER TABLE `Beneficiary` ADD COLUMN `sector` VARCHAR(191) NULL;
