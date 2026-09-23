-- Cotización → POS: persistir líneas y referenciar en ventas
ALTER TABLE `cotizaciones`
  ADD COLUMN `linesJson` JSON NULL AFTER `includeAssemblyService`;

ALTER TABLE `pos_sales`
  ADD COLUMN `quoteNumber` VARCHAR(64) NULL AFTER `cashSessionId`;

CREATE INDEX `idx_pos_sales_quoteNumber` ON `pos_sales` (`quoteNumber`);
