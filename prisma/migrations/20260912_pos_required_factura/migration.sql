-- Flag de cobro: cliente requiere factura (0/1)
ALTER TABLE `pos_sales`
  ADD COLUMN `requiredFactura` TINYINT(1) NOT NULL DEFAULT 0 AFTER `notes`;
