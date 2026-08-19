ALTER TABLE `shipments` ADD COLUMN `groupKey` VARCHAR(255) NULL AFTER `orderId`;
CREATE INDEX `shipments_group_key_idx` ON `shipments` (`groupKey`);
