-- Punto de Venta Fase 1

CREATE TABLE IF NOT EXISTS `pos_sales` (
  `idPosSale` BIGINT NOT NULL AUTO_INCREMENT,
  `folio` VARCHAR(32) NOT NULL,
  `branchId` BIGINT NOT NULL,
  `cashierUserId` BIGINT NOT NULL,
  `customerUserId` BIGINT NULL,
  `customerName` VARCHAR(255) NULL,
  `status` ENUM('completed', 'cancelled', 'pending_payment') NOT NULL DEFAULT 'completed',
  `subtotal` DECIMAL(12, 2) NOT NULL,
  `discountTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12, 2) NOT NULL,
  `notes` TEXT NULL,
  `cancelReason` TEXT NULL,
  `cancelledAt` DATETIME NULL,
  `cancelledByUserId` BIGINT NULL,
  `customerEmail` VARCHAR(255) NULL,
  `customerPhone` VARCHAR(45) NULL,
  `paymentLinkUrl` TEXT NULL,
  `checkoutLinkUrl` TEXT NULL,
  `linkReferencia` VARCHAR(64) NULL,
  `idLinkPago` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idPosSale`),
  UNIQUE KEY `uk_pos_sales_folio` (`folio`),
  KEY `idx_pos_sales_branchId` (`branchId`),
  KEY `idx_pos_sales_cashierUserId` (`cashierUserId`),
  KEY `idx_pos_sales_customerUserId` (`customerUserId`),
  KEY `idx_pos_sales_status_createdAt` (`status`, `createdAt`),
  KEY `idx_pos_sales_createdAt` (`createdAt`),
  CONSTRAINT `fk_pos_sales_branchId` FOREIGN KEY (`branchId`) REFERENCES `branches` (`idBranche`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_pos_sales_cashierUserId` FOREIGN KEY (`cashierUserId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_pos_sales_customerUserId` FOREIGN KEY (`customerUserId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pos_sale_items` (
  `idPosSaleItem` BIGINT NOT NULL AUTO_INCREMENT,
  `posSaleId` BIGINT NOT NULL,
  `productId` BIGINT NOT NULL,
  `productName` VARCHAR(255) NOT NULL,
  `productSku` VARCHAR(255) NULL,
  `productUpc` VARCHAR(255) NULL,
  `quantity` INT NOT NULL,
  `unitPrice` DECIMAL(12, 2) NOT NULL,
  `discountPct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
  `lineTotal` DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (`idPosSaleItem`),
  KEY `idx_pos_sale_items_posSaleId` (`posSaleId`),
  KEY `idx_pos_sale_items_productId` (`productId`),
  CONSTRAINT `fk_pos_sale_items_posSaleId` FOREIGN KEY (`posSaleId`) REFERENCES `pos_sales` (`idPosSale`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_pos_sale_items_productId` FOREIGN KEY (`productId`) REFERENCES `products` (`idProduct`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pos_payments` (
  `idPosPayment` BIGINT NOT NULL AUTO_INCREMENT,
  `posSaleId` BIGINT NOT NULL,
  `method` ENUM('efectivo_sucursal', 'tarjeta_sucursal', 'transferencia_bancaria', 'openpay_link') NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `reference` VARCHAR(255) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idPosPayment`),
  KEY `idx_pos_payments_posSaleId` (`posSaleId`),
  CONSTRAINT `fk_pos_payments_posSaleId` FOREIGN KEY (`posSaleId`) REFERENCES `pos_sales` (`idPosSale`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pos_sale_events` (
  `idPosSaleEvent` BIGINT NOT NULL AUTO_INCREMENT,
  `posSaleId` BIGINT NOT NULL,
  `userId` BIGINT NULL,
  `eventType` VARCHAR(64) NOT NULL,
  `reason` TEXT NULL,
  `payload` JSON NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idPosSaleEvent`),
  KEY `idx_pos_sale_events_posSaleId` (`posSaleId`),
  KEY `idx_pos_sale_events_createdAt` (`createdAt`),
  CONSTRAINT `fk_pos_sale_events_posSaleId` FOREIGN KEY (`posSaleId`) REFERENCES `pos_sales` (`idPosSale`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_pos_sale_events_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `idInventoryMovement` BIGINT NOT NULL AUTO_INCREMENT,
  `productId` BIGINT NOT NULL,
  `branchId` BIGINT NULL,
  `userId` BIGINT NULL,
  `delta` INT NOT NULL,
  `reason` VARCHAR(64) NOT NULL,
  `refType` VARCHAR(64) NULL,
  `refId` VARCHAR(64) NULL,
  `note` VARCHAR(255) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idInventoryMovement`),
  KEY `idx_inventory_movements_product_created` (`productId`, `createdAt`),
  KEY `idx_inventory_movements_branchId` (`branchId`),
  KEY `idx_inventory_movements_ref` (`refType`, `refId`),
  CONSTRAINT `fk_inventory_movements_productId` FOREIGN KEY (`productId`) REFERENCES `products` (`idProduct`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_inventory_movements_branchId` FOREIGN KEY (`branchId`) REFERENCES `branches` (`idBranche`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_inventory_movements_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
