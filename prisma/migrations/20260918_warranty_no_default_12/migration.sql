-- Quitar el DEFAULT 12 engañoso de products.warrantyMonths.
-- Sin dato real → NULL → hoja de garantía: «Según marca / servicio».
-- Los 12 actuales se consideran placeholder de la migración (no hay catálogo real de plazos).

ALTER TABLE `products`
  MODIFY COLUMN `warrantyMonths` INT NULL DEFAULT NULL;

UPDATE `products`
SET `warrantyMonths` = NULL
WHERE `warrantyMonths` = 12;

-- Series ya vendidas con el 12 fantasma: alinear a «según marca».
UPDATE `product_serials`
SET `warrantyMonths` = NULL,
    `warrantyExpiresAt` = NULL
WHERE `warrantyMonths` = 12;
