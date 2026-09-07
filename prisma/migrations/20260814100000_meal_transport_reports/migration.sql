-- Weekly Meal & Transport Expense Report — configurable per submitter
-- role, with a preparer signature and a role-configured approver
-- signature, entries for the week, and computed totals.

CREATE TABLE `MealTransportReportConfig` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `submitterRoleId` VARCHAR(191) NOT NULL,
  `approverUserId` VARCHAR(191) NOT NULL,
  `projectName` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL DEFAULT '',
  `subtitle` VARCHAR(191) NOT NULL DEFAULT 'Weekly Meal & Transport Expense Report Form',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MealTransportReportConfig_tenantId_submitterRoleId_key`(`tenantId`, `submitterRoleId`)
);

CREATE TABLE `MealTransportReport` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `configId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `weekNumber` INT NOT NULL,
  `weekStart` DATETIME(3) NOT NULL,
  `weekEnd` DATETIME(3) NOT NULL,
  `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
  `preparerSignatureName` VARCHAR(191) NULL,
  `preparerSignedAt` DATETIME(3) NULL,
  `approverSignatureName` VARCHAR(191) NULL,
  `approverSignedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MealTransportReport_userId_weekNumber_key`(`userId`, `weekNumber`),
  INDEX `MealTransportReport_tenantId_fkey`(`tenantId`),
  INDEX `MealTransportReport_configId_fkey`(`configId`)
);

CREATE TABLE `MealTransportReportEntry` (
  `id` VARCHAR(191) NOT NULL,
  `reportId` VARCHAR(191) NOT NULL,
  `date` DATETIME(3) NOT NULL,
  `mealUsd` DOUBLE NOT NULL DEFAULT 0,
  `accommodationUsd` DOUBLE NOT NULL DEFAULT 0,
  `transportUsd` DOUBLE NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MealTransportReportEntry_reportId_date_key`(`reportId`, `date`),
  INDEX `MealTransportReportEntry_reportId_fkey`(`reportId`)
);

ALTER TABLE `MealTransportReportConfig` ADD CONSTRAINT `MealTransportReportConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MealTransportReportConfig` ADD CONSTRAINT `MealTransportReportConfig_submitterRoleId_fkey` FOREIGN KEY (`submitterRoleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MealTransportReportConfig` ADD CONSTRAINT `MealTransportReportConfig_approverUserId_fkey` FOREIGN KEY (`approverUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MealTransportReport` ADD CONSTRAINT `MealTransportReport_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MealTransportReport` ADD CONSTRAINT `MealTransportReport_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `MealTransportReportConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MealTransportReport` ADD CONSTRAINT `MealTransportReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MealTransportReportEntry` ADD CONSTRAINT `MealTransportReportEntry_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `MealTransportReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
