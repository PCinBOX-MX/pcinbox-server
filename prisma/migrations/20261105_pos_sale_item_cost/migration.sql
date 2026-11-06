ALTER TABLE `pos_sale_items`
  ADD COLUMN `costUnit` DECIMAL(12, 2) NULL AFTER `serviceMetaJson`,
  ADD COLUMN `profitMarginUnit` DECIMAL(12, 2) NULL AFTER `costUnit`,
  ADD COLUMN `catalogPriceUnit` DECIMAL(12, 2) NULL AFTER `profitMarginUnit`;
