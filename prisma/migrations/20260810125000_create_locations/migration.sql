-- CORRECTED 2026-08-11: added `izina` (Kinyarwanda name) and created_at/
-- updated_at timestamp columns, and sized `name`/`izina` to VARCHAR(255) —
-- to match both schema.prisma and the columns scripts/import-geo-sql.ts
-- actually populates from the Laravel-style admin-boundary SQL dump.
-- Also dropped AUTO_INCREMENT: these ids are the real Rwanda government
-- administrative codes assigned by the import script, not auto-generated.
CREATE TABLE `provinces` (
  `id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `izina` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP(0) NULL,
  `updated_at` TIMESTAMP(0) NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE `districts` (
  `id` INT NOT NULL,
  `province` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP(0) NULL,
  `updated_at` TIMESTAMP(0) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `districts_province_fkey`
    FOREIGN KEY (`province`) REFERENCES `provinces`(`id`)
);
CREATE INDEX `districts_province_foreign` ON `districts`(`province`);

CREATE TABLE `sectors` (
  `id` INT NOT NULL,
  `district` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP(0) NULL,
  `updated_at` TIMESTAMP(0) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `sectors_district_fkey`
    FOREIGN KEY (`district`) REFERENCES `districts`(`id`)
);
CREATE INDEX `sectors_district_foreign` ON `sectors`(`district`);

CREATE TABLE `cells` (
  `id` INT NOT NULL,
  `sector` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP(0) NULL,
  `updated_at` TIMESTAMP(0) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `cells_sector_fkey`
    FOREIGN KEY (`sector`) REFERENCES `sectors`(`id`)
);
CREATE INDEX `cells_sector_foreign` ON `cells`(`sector`);

CREATE TABLE `villages` (
  `id` INT NOT NULL,
  `cell` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP(0) NULL,
  `updated_at` TIMESTAMP(0) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `villages_cell_fkey`
    FOREIGN KEY (`cell`) REFERENCES `cells`(`id`)
);
CREATE INDEX `villages_cell_foreign` ON `villages`(`cell`);
