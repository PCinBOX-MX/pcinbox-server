-- Crea product_serials si no existe (cobro POS falla sin esta tabla)

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
  `notes` VARCHAR(500) NULL,
  `warrantyExpiresAt` DATETIME NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idProductSerial`),
  UNIQUE KEY `uk_product_serials_serialNumber` (`serialNumber`),
  KEY `idx_product_serials_productId` (`productId`),
  KEY `idx_product_serials_status` (`status`),
  KEY `idx_product_serials_posSaleId` (`posSaleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- FKs solo si no existen (MySQL no tiene ADD CONSTRAINT IF NOT EXISTS)
SET @fk_prod := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_serials'
    AND CONSTRAINT_NAME = 'fk_product_serials_productId'
);
SET @sql_fk_prod := IF(
  @fk_prod = 0,
  'ALTER TABLE `product_serials` ADD CONSTRAINT `fk_product_serials_productId` FOREIGN KEY (`productId`) REFERENCES `products` (`idProduct`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE s1 FROM @sql_fk_prod; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @fk_branch := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_serials'
    AND CONSTRAINT_NAME = 'fk_product_serials_branchId'
);
SET @sql_fk_branch := IF(
  @fk_branch = 0,
  'ALTER TABLE `product_serials` ADD CONSTRAINT `fk_product_serials_branchId` FOREIGN KEY (`branchId`) REFERENCES `branches` (`idBranche`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE s2 FROM @sql_fk_branch; EXECUTE s2; DEALLOCATE PREPARE s2;

SET @fk_sale := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_serials'
    AND CONSTRAINT_NAME = 'fk_product_serials_posSaleId'
);
SET @sql_fk_sale := IF(
  @fk_sale = 0,
  'ALTER TABLE `product_serials` ADD CONSTRAINT `fk_product_serials_posSaleId` FOREIGN KEY (`posSaleId`) REFERENCES `pos_sales` (`idPosSale`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE s3 FROM @sql_fk_sale; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @fk_item := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_serials'
    AND CONSTRAINT_NAME = 'fk_product_serials_posSaleItemId'
);
SET @sql_fk_item := IF(
  @fk_item = 0,
  'ALTER TABLE `product_serials` ADD CONSTRAINT `fk_product_serials_posSaleItemId` FOREIGN KEY (`posSaleItemId`) REFERENCES `pos_sale_items` (`idPosSaleItem`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE s4 FROM @sql_fk_item; EXECUTE s4; DEALLOCATE PREPARE s4;

SET @fk_user := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_serials'
    AND CONSTRAINT_NAME = 'fk_product_serials_customer'
);
SET @sql_fk_user := IF(
  @fk_user = 0,
  'ALTER TABLE `product_serials` ADD CONSTRAINT `fk_product_serials_customer` FOREIGN KEY (`customerUserId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION',
  'SELECT 1'
);
PREPARE s5 FROM @sql_fk_user; EXECUTE s5; DEALLOCATE PREPARE s5;
