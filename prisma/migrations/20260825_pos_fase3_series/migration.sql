-- POS Fase 3: números de serie y garantías

ALTER TABLE `products`
  ADD COLUMN `requiresSerial` TINYINT(1) NOT NULL DEFAULT 0 AFTER `licenseType`,
  ADD COLUMN `warrantyMonths` INT NULL DEFAULT 12 AFTER `requiresSerial`;

CREATE TABLE IF NOT EXISTS `product_serials` (
  `idProductSerial` BIGINT NOT NULL AUTO_INCREMENT,
  `productId` BIGINT NOT NULL,
  `serialNumber` VARCHAR(128) NOT NULL,
  `branchId` BIGINT NULL,
  `status` ENUM('available', 'sold', 'rma', 'returned') NOT NULL DEFAULT 'available',
  `posSaleId` BIGINT NULL,
  `posSaleItemId` BIGINT NULL,
  `customerUserId` BIGINT NULL,
  `customerName` VARCHAR(255) NULL,
  `soldAt` DATETIME NULL,
  `warrantyMonths` INT NULL,
  `warrantyExpiresAt` DATETIME NULL,
  `notes` VARCHAR(500) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idProductSerial`),
  UNIQUE KEY `uk_product_serials_serialNumber` (`serialNumber`),
  KEY `idx_product_serials_productId` (`productId`),
  KEY `idx_product_serials_status` (`status`),
  KEY `idx_product_serials_posSaleId` (`posSaleId`),
  CONSTRAINT `fk_product_serials_productId` FOREIGN KEY (`productId`) REFERENCES `products` (`idProduct`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_product_serials_branchId` FOREIGN KEY (`branchId`) REFERENCES `branches` (`idBranche`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_product_serials_posSaleId` FOREIGN KEY (`posSaleId`) REFERENCES `pos_sales` (`idPosSale`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_product_serials_posSaleItemId` FOREIGN KEY (`posSaleItemId`) REFERENCES `pos_sale_items` (`idPosSaleItem`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_product_serials_customer` FOREIGN KEY (`customerUserId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
