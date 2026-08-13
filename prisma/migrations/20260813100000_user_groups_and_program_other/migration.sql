-- AlterTable: Supervisor & Enumerator group-import fields on User
ALTER TABLE `User`
  ADD COLUMN `groupCode` VARCHAR(191) NULL,
  ADD COLUMN `groupName` VARCHAR(191) NULL,
  ADD COLUMN `operationalArea` VARCHAR(191) NULL;

-- AlterTable: free-text companions for the "Other" option on Program's
-- Study Scenario and Status selects
ALTER TABLE `Program`
  ADD COLUMN `scenarioTypeOther` VARCHAR(191) NULL,
  ADD COLUMN `statusOther` VARCHAR(191) NULL;

-- AlterTable: add OTHER to ScenarioType
ALTER TABLE `Program` MODIFY `scenarioType` ENUM(
  'BASELINE_SURVEY',
  'ENDLINE_SURVEY',
  'TRACER_STUDY',
  'PROGRAM_OUTCOME_ASSESSMENT',
  'QUALITATIVE_STUDY',
  'OTHER'
) NULL;

-- AlterTable: add OTHER to ProjectStatus
ALTER TABLE `Program` MODIFY `status` ENUM(
  'PLANNING',
  'FIELDWORK',
  'DATA_CLEANING',
  'REPORTING',
  'COMPLETED',
  'OTHER'
) NOT NULL DEFAULT 'PLANNING';
