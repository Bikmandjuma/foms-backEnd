-- ============================================================
-- Rebuild geographic foreign-key indexes
-- ============================================================

-- Recreate province/district/sector/cell/village hierarchy
-- foreign keys using the desired Prisma schema behavior.

ALTER TABLE `cells`
    DROP FOREIGN KEY `cells_sector_fkey`;

ALTER TABLE `districts`
    DROP FOREIGN KEY `districts_province_fkey`;

ALTER TABLE `sectors`
    DROP FOREIGN KEY `sectors_district_fkey`;

ALTER TABLE `villages`
    DROP FOREIGN KEY `villages_cell_fkey`;


ALTER TABLE `districts`
    ADD CONSTRAINT `districts_province_fkey`
    FOREIGN KEY (`province`)
    REFERENCES `provinces`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE `sectors`
    ADD CONSTRAINT `sectors_district_fkey`
    FOREIGN KEY (`district`)
    REFERENCES `districts`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE `cells`
    ADD CONSTRAINT `cells_sector_fkey`
    FOREIGN KEY (`sector`)
    REFERENCES `sectors`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE `villages`
    ADD CONSTRAINT `villages_cell_fkey`
    FOREIGN KEY (`cell`)
    REFERENCES `cells`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;


-- ============================================================
-- BENEFICIARY INDEXES
-- ============================================================

CREATE INDEX `Beneficiary_cellId_idx`
    ON `Beneficiary`(`cellId`);

CREATE INDEX `Beneficiary_districtId_idx`
    ON `Beneficiary`(`districtId`);

CREATE INDEX `Beneficiary_provinceId_idx`
    ON `Beneficiary`(`provinceId`);

CREATE INDEX `Beneficiary_sectorId_idx`
    ON `Beneficiary`(`sectorId`);

CREATE INDEX `Beneficiary_villageId_idx`
    ON `Beneficiary`(`villageId`);


-- ============================================================
-- USER INDEXES
-- ============================================================

CREATE INDEX `User_cellId_idx`
    ON `User`(`cellId`);

CREATE INDEX `User_districtId_idx`
    ON `User`(`districtId`);

CREATE INDEX `User_provinceId_idx`
    ON `User`(`provinceId`);

CREATE INDEX `User_sectorId_idx`
    ON `User`(`sectorId`);

CREATE INDEX `User_villageId_idx`
    ON `User`(`villageId`);