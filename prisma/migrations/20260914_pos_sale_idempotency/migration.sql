-- POS harden: idempotency key for cobros (anti doble venta)
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_sales'
    AND COLUMN_NAME = 'idempotencyKey'
);
SET @sql := IF(
  @has_col = 0,
  'ALTER TABLE `pos_sales` ADD COLUMN `idempotencyKey` VARCHAR(64) NULL AFTER `quoteNumber`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_sales'
    AND INDEX_NAME = 'uk_pos_sales_idempotencyKey'
);
SET @sql_idx := IF(
  @has_idx = 0,
  'CREATE UNIQUE INDEX `uk_pos_sales_idempotencyKey` ON `pos_sales` (`idempotencyKey`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
