-- Asegura columnas de series en products (idempotente)

SET @has_requires := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'requiresSerial'
);

SET @sql_requires := IF(
  @has_requires = 0,
  'ALTER TABLE `products` ADD COLUMN `requiresSerial` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt_requires FROM @sql_requires;
EXECUTE stmt_requires;
DEALLOCATE PREPARE stmt_requires;

SET @has_warranty := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'warrantyMonths'
);

SET @sql_warranty := IF(
  @has_warranty = 0,
  'ALTER TABLE `products` ADD COLUMN `warrantyMonths` INT NULL DEFAULT 12',
  'SELECT 1'
);
PREPARE stmt_warranty FROM @sql_warranty;
EXECUTE stmt_warranty;
DEALLOCATE PREPARE stmt_warranty;
