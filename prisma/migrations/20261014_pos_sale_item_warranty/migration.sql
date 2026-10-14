-- Garantía cobrada en la línea, para reimportar el folio sin volver a elegirla.

SET NAMES utf8mb4;

SET @has_item_warranty_months := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_sale_items'
    AND COLUMN_NAME = 'warrantyMonths'
);
SET @sql_item_warranty_months := IF(
  @has_item_warranty_months = 0,
  'ALTER TABLE `pos_sale_items` ADD COLUMN `warrantyMonths` INT NULL AFTER `lineTotal`',
  'SELECT 1'
);
PREPARE stmt FROM @sql_item_warranty_months; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_item_warranty_mode := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_sale_items'
    AND COLUMN_NAME = 'warrantyMode'
);
SET @sql_item_warranty_mode := IF(
  @has_item_warranty_mode = 0,
  'ALTER TABLE `pos_sale_items` ADD COLUMN `warrantyMode` VARCHAR(32) NULL AFTER `warrantyMonths`',
  'SELECT 1'
);
PREPARE stmt FROM @sql_item_warranty_mode; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `pos_sale_items` i
INNER JOIN `product_serials` s ON s.posSaleItemId = i.idPosSaleItem
SET i.warrantyMonths = s.warrantyMonths,
    i.warrantyMode = s.warrantyMode
WHERE (i.warrantyMode IS NULL OR i.warrantyMode = '')
  AND s.warrantyMode IS NOT NULL
  AND s.warrantyMode <> '';
