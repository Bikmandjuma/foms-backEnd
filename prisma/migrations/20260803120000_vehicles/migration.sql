-- CreateTable
CREATE TABLE `Vehicle` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('VEHICLE', 'MOTORCYCLE') NOT NULL DEFAULT 'VEHICLE',
    `driverName` VARCHAR(191) NULL,
    `capacityPerDay` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: BeneficiaryAssignment gains optional transport/vehicle fields
ALTER TABLE `BeneficiaryAssignment` ADD COLUMN `transportMode` ENUM('NONE', 'VEHICLE', 'MOTORCYCLE', 'WALKING', 'PUBLIC_TRANSPORT') NULL;
ALTER TABLE `BeneficiaryAssignment` ADD COLUMN `vehicleId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BeneficiaryAssignment` ADD CONSTRAINT `BeneficiaryAssignment_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
