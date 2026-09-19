-- Garantía tipada + seed catálogo (aplicar en BD local / prod)
-- Fuente: pos_module_full.sql + prisma/migrations/20260919_pos_warranty_mode

SET NAMES utf8mb4;

SET @has_warranty_mode := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'warrantyMode'
);
SET @sql_warranty_mode := IF(
  @has_warranty_mode = 0,
  'ALTER TABLE `products` ADD COLUMN `warrantyMode` VARCHAR(32) NULL AFTER `warrantyMonths`',
  'SELECT 1'
);
PREPARE stmt FROM @sql_warranty_mode; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_ps_mode := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_serials'
    AND COLUMN_NAME = 'warrantyMode'
);
SET @sql_ps_mode := IF(
  @has_ps_mode = 0,
  'ALTER TABLE `product_serials` ADD COLUMN `warrantyMode` VARCHAR(32) NULL AFTER `warrantyMonths`',
  'SELECT 1'
);
PREPARE stmt FROM @sql_ps_mode; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- TechSmart (2): todo 1 año
UPDATE `products`
SET `warrantyMonths` = 12,
    `warrantyMode` = 'months'
WHERE `providerId` = 2;

-- PCinBOX (1) PC gamer / estaciones: 1 año
UPDATE `products`
SET `warrantyMonths` = 12,
    `warrantyMode` = 'months'
WHERE `providerId` = 1
  AND `isPC` = 1;

-- Alinear mode si ya había meses
UPDATE `products`
SET `warrantyMode` = 'months'
WHERE `warrantyMonths` IS NOT NULL
  AND `warrantyMonths` > 0
  AND (`warrantyMode` IS NULL OR `warrantyMode` = '');

-- Verificación
SELECT
  providerId,
  CASE WHEN isPC = 1 THEN 'isPC' ELSE 'other' END AS kind,
  warrantyMonths,
  warrantyMode,
  COUNT(*) AS n
FROM products
WHERE providerId IN (1, 2, 3)
GROUP BY providerId, CASE WHEN isPC = 1 THEN 'isPC' ELSE 'other' END, warrantyMonths, warrantyMode
ORDER BY providerId, kind, warrantyMonths;
