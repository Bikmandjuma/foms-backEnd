-- ============================================================
-- Normalize User and Beneficiary geographic locations
-- ============================================================

-- Add all normalized geographic FK columns.
-- IF NOT EXISTS makes this safe if some columns were created
-- during an earlier partial migration attempt.

-- ============================================================
-- Normalize User and Beneficiary geographic locations
-- ============================================================

-- ============================================================
-- Normalize User and Beneficiary geographic locations
-- ============================================================

-- Add all normalized geographic FK columns.

ALTER TABLE `User`
    ADD COLUMN `provinceId` INT NULL;

ALTER TABLE `User`
    ADD COLUMN `districtId` INT NULL;

ALTER TABLE `User`
    ADD COLUMN `sectorId` INT NULL;

ALTER TABLE `User`
    ADD COLUMN `cellId` INT NULL;

ALTER TABLE `User`
    ADD COLUMN `villageId` INT NULL;

ALTER TABLE `Beneficiary`
    ADD COLUMN `provinceId` INT NULL;

ALTER TABLE `Beneficiary`
    ADD COLUMN `districtId` INT NULL;

ALTER TABLE `Beneficiary`
    ADD COLUMN `sectorId` INT NULL;

ALTER TABLE `Beneficiary`
    ADD COLUMN `cellId` INT NULL;

ALTER TABLE `Beneficiary`
    ADD COLUMN `villageId` INT NULL;



-- ============================================================
-- BACKFILL USER LOCATION IDs
-- ============================================================
-- The COLLATE clauses prevent errors such as:
-- Illegal mix of collations
-- utf8mb4_general_ci vs utf8mb4_unicode_ci

UPDATE `User` u

JOIN `villages` v
    ON v.name COLLATE utf8mb4_general_ci =
       u.village COLLATE utf8mb4_general_ci

JOIN `cells` c
    ON v.cell = c.id
   AND c.name COLLATE utf8mb4_general_ci =
       u.cell COLLATE utf8mb4_general_ci

JOIN `sectors` s
    ON c.sector = s.id
   AND s.name COLLATE utf8mb4_general_ci =
       u.sector COLLATE utf8mb4_general_ci

JOIN `districts` d
    ON s.district = d.id
   AND d.name COLLATE utf8mb4_general_ci =
       u.district COLLATE utf8mb4_general_ci

JOIN `provinces` p
    ON d.province = p.id
   AND p.name COLLATE utf8mb4_general_ci =
       u.province COLLATE utf8mb4_general_ci

SET
    u.villageId = v.id,
    u.cellId = c.id,
    u.sectorId = s.id,
    u.districtId = d.id,
    u.provinceId = p.id

WHERE u.village IS NOT NULL
  AND u.villageId IS NULL;


-- ============================================================
-- BACKFILL BENEFICIARY LOCATION IDs
-- ============================================================

UPDATE `Beneficiary` b

JOIN `villages` v
    ON v.name COLLATE utf8mb4_general_ci =
       b.village COLLATE utf8mb4_general_ci

JOIN `cells` c
    ON v.cell = c.id
   AND c.name COLLATE utf8mb4_general_ci =
       b.cell COLLATE utf8mb4_general_ci

JOIN `sectors` s
    ON c.sector = s.id
   AND s.name COLLATE utf8mb4_general_ci =
       b.sector COLLATE utf8mb4_general_ci

JOIN `districts` d
    ON s.district = d.id
   AND d.name COLLATE utf8mb4_general_ci =
       b.district COLLATE utf8mb4_general_ci

JOIN `provinces` p
    ON d.province = p.id
   AND p.name COLLATE utf8mb4_general_ci =
       b.province COLLATE utf8mb4_general_ci

SET
    b.villageId = v.id,
    b.cellId = c.id,
    b.sectorId = s.id,
    b.districtId = d.id,
    b.provinceId = p.id

WHERE b.village IS NOT NULL
  AND b.villageId IS NULL;


-- ============================================================
-- ADD USER FOREIGN KEYS
-- ============================================================

ALTER TABLE `User`
    ADD CONSTRAINT `User_provinceId_fkey`
    FOREIGN KEY (`provinceId`)
    REFERENCES `provinces`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `User`
    ADD CONSTRAINT `User_districtId_fkey`
    FOREIGN KEY (`districtId`)
    REFERENCES `districts`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `User`
    ADD CONSTRAINT `User_sectorId_fkey`
    FOREIGN KEY (`sectorId`)
    REFERENCES `sectors`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `User`
    ADD CONSTRAINT `User_cellId_fkey`
    FOREIGN KEY (`cellId`)
    REFERENCES `cells`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `User`
    ADD CONSTRAINT `User_villageId_fkey`
    FOREIGN KEY (`villageId`)
    REFERENCES `villages`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;


-- ============================================================
-- ADD BENEFICIARY FOREIGN KEYS
-- ============================================================

ALTER TABLE `Beneficiary`
    ADD CONSTRAINT `Beneficiary_provinceId_fkey`
    FOREIGN KEY (`provinceId`)
    REFERENCES `provinces`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `Beneficiary`
    ADD CONSTRAINT `Beneficiary_districtId_fkey`
    FOREIGN KEY (`districtId`)
    REFERENCES `districts`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `Beneficiary`
    ADD CONSTRAINT `Beneficiary_sectorId_fkey`
    FOREIGN KEY (`sectorId`)
    REFERENCES `sectors`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `Beneficiary`
    ADD CONSTRAINT `Beneficiary_cellId_fkey`
    FOREIGN KEY (`cellId`)
    REFERENCES `cells`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE `Beneficiary`
    ADD CONSTRAINT `Beneficiary_villageId_fkey`
    FOREIGN KEY (`villageId`)
    REFERENCES `villages`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;


-- ============================================================
-- REMOVE OLD ADMIN LOCATION RELATION
-- ============================================================

ALTER TABLE `User`
    DROP FOREIGN KEY `User_adminLocationId_fkey`;

ALTER TABLE `User`
    DROP COLUMN `adminLocationId`;


ALTER TABLE `Beneficiary`
    DROP FOREIGN KEY `Beneficiary_adminLocationId_fkey`;

ALTER TABLE `Beneficiary`
    DROP COLUMN `adminLocationId`;


DROP TABLE `AdminLocation`;


-- ============================================================
-- REMOVE OLD DENORMALIZED LOCATION STRINGS FROM USER
-- ============================================================

ALTER TABLE `User`
    DROP COLUMN `province`;

ALTER TABLE `User`
    DROP COLUMN `district`;

ALTER TABLE `User`
    DROP COLUMN `sector`;

ALTER TABLE `User`
    DROP COLUMN `cell`;

ALTER TABLE `User`
    DROP COLUMN `village`;


-- ============================================================
-- REMOVE OLD DENORMALIZED LOCATION STRINGS FROM BENEFICIARY
-- ============================================================

ALTER TABLE `Beneficiary`
    DROP COLUMN `province`;

ALTER TABLE `Beneficiary`
    DROP COLUMN `district`;

ALTER TABLE `Beneficiary`
    DROP COLUMN `sector`;

ALTER TABLE `Beneficiary`
    DROP COLUMN `cell`;

ALTER TABLE `Beneficiary`
    DROP COLUMN `village`;