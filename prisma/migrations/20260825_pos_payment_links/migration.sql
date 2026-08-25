-- POS: persistir datos de link OpenPay / contacto en pos_sales
ALTER TABLE `pos_sales`
  ADD COLUMN `customerEmail` VARCHAR(255) NULL AFTER `cancelledByUserId`,
  ADD COLUMN `customerPhone` VARCHAR(45) NULL AFTER `customerEmail`,
  ADD COLUMN `paymentLinkUrl` TEXT NULL AFTER `customerPhone`,
  ADD COLUMN `checkoutLinkUrl` TEXT NULL AFTER `paymentLinkUrl`,
  ADD COLUMN `linkReferencia` VARCHAR(64) NULL AFTER `checkoutLinkUrl`,
  ADD COLUMN `idLinkPago` INT NULL AFTER `linkReferencia`;
