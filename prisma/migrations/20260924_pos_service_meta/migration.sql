ALTER TABLE `pos_sale_items`
  ADD COLUMN `serviceMetaJson` JSON NULL AFTER `lineTotal`;
