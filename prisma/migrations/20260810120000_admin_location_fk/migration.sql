-- AlterTable: link User to a canonical AdminLocation row, keeping the
-- existing province/district/sector/cell/village strings for display/filtering
ALTER TABLE `User` ADD COLUMN `adminLocationId` VARCHAR(191) NULL;

-- AlterTable: same for Beneficiary
ALTER TABLE `Beneficiary` ADD COLUMN `adminLocationId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `User_adminLocationId_fkey` ON `User`(`adminLocationId`);

-- CreateIndex
CREATE INDEX `Beneficiary_adminLocationId_fkey` ON `Beneficiary`(`adminLocationId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_adminLocationId_fkey` FOREIGN KEY (`adminLocationId`) REFERENCES `AdminLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Beneficiary` ADD CONSTRAINT `Beneficiary_adminLocationId_fkey` FOREIGN KEY (`adminLocationId`) REFERENCES `AdminLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
