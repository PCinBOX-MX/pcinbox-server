ALTER TABLE `billing`
  ADD COLUMN `active` TINYINT NULL DEFAULT 1 AFTER `createdAt`;

UPDATE `billing` SET `active` = 1 WHERE `active` IS NULL;

CREATE INDEX `billing_userId_active_idx`
  ON `billing`(`userId`, `active`);
