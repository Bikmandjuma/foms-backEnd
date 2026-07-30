-- One-time manual repair script.
-- Purpose: undo the PARTIAL effect of the earlier failed servayx migration
-- attempt on Railway, so the corrected migration can be re-applied cleanly.
--
-- Context: the first failed deploy attempt executed statement #1
-- (ALTER TABLE Beneficiary ADD COLUMN consentAt/consentGiven/outcome)
-- successfully before failing on the case-mismatched `program` table name.
-- That leaves Beneficiary 3 columns ahead of what _prisma_migrations
-- believes is applied. This script removes just those 3 columns so the
-- Railway database matches the "only init applied" state again.
--
-- Safe to run: it only touches the 3 columns nothing else has read/written
-- yet (the whole servayx migration never successfully completed).

ALTER TABLE `Beneficiary`
    DROP COLUMN `consentAt`,
    DROP COLUMN `consentGiven`,
    DROP COLUMN `outcome`;
