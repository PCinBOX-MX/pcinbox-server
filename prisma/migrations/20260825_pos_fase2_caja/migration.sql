-- POS Fase 2: control de caja

CREATE TABLE IF NOT EXISTS `pos_cash_sessions` (
  `idCashSession` BIGINT NOT NULL AUTO_INCREMENT,
  `branchId` BIGINT NOT NULL,
  `openedByUserId` BIGINT NOT NULL,
  `closedByUserId` BIGINT NULL,
  `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  `openingFloat` DECIMAL(12, 2) NOT NULL,
  `closingCounted` DECIMAL(12, 2) NULL,
  `expectedCash` DECIMAL(12, 2) NULL,
  `difference` DECIMAL(12, 2) NULL,
  `notes` TEXT NULL,
  `openedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closedAt` DATETIME NULL,
  PRIMARY KEY (`idCashSession`),
  KEY `idx_pos_cash_sessions_branch_status` (`branchId`, `status`),
  KEY `idx_pos_cash_sessions_openedAt` (`openedAt`),
  CONSTRAINT `fk_pos_cash_sessions_branchId` FOREIGN KEY (`branchId`) REFERENCES `branches` (`idBranche`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_pos_cash_sessions_openedBy` FOREIGN KEY (`openedByUserId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_pos_cash_sessions_closedBy` FOREIGN KEY (`closedByUserId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pos_cash_movements` (
  `idCashMovement` BIGINT NOT NULL AUTO_INCREMENT,
  `cashSessionId` BIGINT NOT NULL,
  `userId` BIGINT NOT NULL,
  `type` ENUM('cash_in', 'cash_out', 'sale_cash', 'sale_cash_void') NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `reason` VARCHAR(255) NULL,
  `posSaleId` BIGINT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idCashMovement`),
  KEY `idx_pos_cash_movements_session` (`cashSessionId`),
  KEY `idx_pos_cash_movements_createdAt` (`createdAt`),
  CONSTRAINT `fk_pos_cash_movements_session` FOREIGN KEY (`cashSessionId`) REFERENCES `pos_cash_sessions` (`idCashSession`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `fk_pos_cash_movements_userId` FOREIGN KEY (`userId`) REFERENCES `users` (`idUser`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `pos_sales`
  ADD COLUMN `cashSessionId` BIGINT NULL AFTER `idLinkPago`,
  ADD KEY `idx_pos_sales_cashSessionId` (`cashSessionId`),
  ADD CONSTRAINT `fk_pos_sales_cashSessionId` FOREIGN KEY (`cashSessionId`) REFERENCES `pos_cash_sessions` (`idCashSession`) ON DELETE NO ACTION ON UPDATE NO ACTION;
