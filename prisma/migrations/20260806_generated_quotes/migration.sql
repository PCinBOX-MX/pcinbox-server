CREATE TABLE `cotizaciones` (
  `idCotizacion` BIGINT NOT NULL AUTO_INCREMENT,
  `quoteNumber` VARCHAR(64) NOT NULL,
  `idempotencyKey` VARCHAR(100) NOT NULL,
  `userId` BIGINT NULL,
  `storageKey` VARCHAR(64) NOT NULL,
  `originalFileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  `sizeBytes` INTEGER NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `totalAmount` DECIMAL(12, 2) NOT NULL,
  `itemCount` INTEGER NOT NULL,
  `includeAssemblyService` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `expiresAt` DATETIME(0) NOT NULL,

  UNIQUE INDEX `cotizaciones_quoteNumber_key`(`quoteNumber`),
  UNIQUE INDEX `cotizaciones_idempotencyKey_key`(`idempotencyKey`),
  UNIQUE INDEX `cotizaciones_storageKey_key`(`storageKey`),
  INDEX `cotizaciones_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `cotizaciones_createdAt_idx`(`createdAt`),
  INDEX `cotizaciones_expiresAt_idx`(`expiresAt`),
  INDEX `cotizaciones_originalFileName_idx`(`originalFileName`),
  PRIMARY KEY (`idCotizacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `cotizaciones`
  ADD CONSTRAINT `cotizaciones_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`idUser`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
