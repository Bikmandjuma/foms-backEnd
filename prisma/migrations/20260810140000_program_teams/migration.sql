-- AlterTable: team-config lives directly on Program (nullable until configured)
ALTER TABLE `Program` ADD COLUMN `teamCount` INT NULL;
ALTER TABLE `Program` ADD COLUMN `membersPerTeam` INT NULL;
ALTER TABLE `Program` ADD COLUMN `teamLeaderRoleId` VARCHAR(191) NULL;
ALTER TABLE `Program` ADD COLUMN `teamMemberRoleId` VARCHAR(191) NULL;

CREATE INDEX `Program_teamLeaderRoleId_fkey` ON `Program`(`teamLeaderRoleId`);
CREATE INDEX `Program_teamMemberRoleId_fkey` ON `Program`(`teamMemberRoleId`);

ALTER TABLE `Program` ADD CONSTRAINT `Program_teamLeaderRoleId_fkey` FOREIGN KEY (`teamLeaderRoleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Program` ADD CONSTRAINT `Program_teamMemberRoleId_fkey` FOREIGN KEY (`teamMemberRoleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `ProgramTeam` (
    `id` VARCHAR(191) NOT NULL,
    `programId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `leaderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProgramTeam_programId_name_key`(`programId`, `name`),
    INDEX `ProgramTeam_tenantId_fkey`(`tenantId`),
    INDEX `ProgramTeam_leaderId_fkey`(`leaderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramTeamMember` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `programId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProgramTeamMember_programId_userId_key`(`programId`, `userId`),
    INDEX `ProgramTeamMember_teamId_fkey`(`teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProgramTeam` ADD CONSTRAINT `ProgramTeam_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProgramTeam` ADD CONSTRAINT `ProgramTeam_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProgramTeam` ADD CONSTRAINT `ProgramTeam_leaderId_fkey` FOREIGN KEY (`leaderId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ProgramTeamMember` ADD CONSTRAINT `ProgramTeamMember_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `ProgramTeam`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProgramTeamMember` ADD CONSTRAINT `ProgramTeamMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
