-- Links a ProgramTeam back to the imported group (User.groupCode) it was
-- adopted from, so the group-assignment UI can tell which imported groups
-- are already linked to a given program.
ALTER TABLE `ProgramTeam` ADD COLUMN `sourceGroupCode` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `ProgramTeam_programId_sourceGroupCode_key` ON `ProgramTeam`(`programId`, `sourceGroupCode`);
