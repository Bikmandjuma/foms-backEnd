-- CreateTable
CREATE TABLE `ProgramTeamVehicle` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProgramTeamVehicle_teamId_vehicleId_key`(`teamId`, `vehicleId`),
    INDEX `ProgramTeamVehicle_vehicleId_fkey`(`vehicleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProgramTeamVehicle` ADD CONSTRAINT `ProgramTeamVehicle_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `ProgramTeam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProgramTeamVehicle` ADD CONSTRAINT `ProgramTeamVehicle_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
