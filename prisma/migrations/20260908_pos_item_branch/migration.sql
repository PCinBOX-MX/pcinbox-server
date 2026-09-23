-- Bodega de origen por línea de venta POS (multi-proveedor)

ALTER TABLE `pos_sale_items`
  ADD COLUMN `branchId` BIGINT NULL AFTER `productId`,
  ADD KEY `idx_pos_sale_items_branchId` (`branchId`),
  ADD CONSTRAINT `fk_pos_sale_items_branchId`
    FOREIGN KEY (`branchId`) REFERENCES `branches` (`idBranche`)
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Backfill: líneas viejas heredan la bodega del encabezado de la venta
UPDATE `pos_sale_items` i
INNER JOIN `pos_sales` s ON s.`idPosSale` = i.`posSaleId`
SET i.`branchId` = s.`branchId`
WHERE i.`branchId` IS NULL;
