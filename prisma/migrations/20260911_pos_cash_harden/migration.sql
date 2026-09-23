-- Endurecer caja POS: motivo de descuadre + una sola sesión abierta por bodega
ALTER TABLE `pos_cash_sessions`
  ADD COLUMN `differenceReason` VARCHAR(500) NULL AFTER `difference`;

-- MySQL: UNIQUE permite varios NULL → solo una fila "open" por branchId
ALTER TABLE `pos_cash_sessions`
  ADD COLUMN `openBranchKey` BIGINT
    GENERATED ALWAYS AS (CASE WHEN `status` = 'open' THEN `branchId` ELSE NULL END) STORED,
  ADD UNIQUE INDEX `uk_pos_cash_one_open_per_branch` (`openBranchKey`);

CREATE INDEX `idx_pos_cash_movements_sale_type`
  ON `pos_cash_movements` (`posSaleId`, `type`);
