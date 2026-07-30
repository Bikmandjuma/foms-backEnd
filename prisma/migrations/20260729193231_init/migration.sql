-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Role_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `telephone` VARCHAR(191) NULL,
    `province` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `sector` VARCHAR(191) NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `educationLevel` ENUM('NONE', 'PRIMARY', 'SECONDARY', 'BACHELORS', 'MASTERS', 'DOCTORATE') NULL,
    `isPlatformAdmin` BOOLEAN NOT NULL DEFAULT false,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `roleId` VARCHAR(191) NULL,
    `tenantId` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Program` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Program_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Beneficiary` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `telephone` VARCHAR(191) NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `province` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `sector` VARCHAR(191) NULL,
    `nationalId` VARCHAR(191) NULL,
    `householdSize` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Beneficiary_tenantId_code_key`(`tenantId`, `code`),
    UNIQUE INDEX `Beneficiary_tenantId_nationalId_key`(`tenantId`, `nationalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `programId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BeneficiaryAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `beneficiaryId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_BeneficiaryToProgram` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_BeneficiaryToProgram_AB_unique`(`A`, `B`),
    INDEX `_BeneficiaryToProgram_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Role` ADD CONSTRAINT `Role_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Beneficiary` ADD CONSTRAINT `Beneficiary_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramAssignment` ADD CONSTRAINT `ProgramAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramAssignment` ADD CONSTRAINT `ProgramAssignment_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramAssignment` ADD CONSTRAINT `ProgramAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BeneficiaryAssignment` ADD CONSTRAINT `BeneficiaryAssignment_beneficiaryId_fkey` FOREIGN KEY (`beneficiaryId`) REFERENCES `Beneficiary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BeneficiaryAssignment` ADD CONSTRAINT `BeneficiaryAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BeneficiaryAssignment` ADD CONSTRAINT `BeneficiaryAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_BeneficiaryToProgram` ADD CONSTRAINT `_BeneficiaryToProgram_A_fkey` FOREIGN KEY (`A`) REFERENCES `Beneficiary`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_BeneficiaryToProgram` ADD CONSTRAINT `_BeneficiaryToProgram_B_fkey` FOREIGN KEY (`B`) REFERENCES `Program`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
