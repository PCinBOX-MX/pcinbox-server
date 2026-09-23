-- POS hardening: folio sequence + support role

CREATE TABLE IF NOT EXISTS `pos_folio_seq` (
  `id` INT NOT NULL DEFAULT 1,
  `next_val` BIGINT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `pos_folio_seq` (`id`, `next_val`)
SELECT 1, GREATEST(COALESCE(MAX(`idPosSale`), 0) + 1, 3414)
FROM `pos_sales`
WHERE NOT EXISTS (SELECT 1 FROM `pos_folio_seq` WHERE `id` = 1);

-- Ampliar enum de roles para vendedores/soporte del panel admin
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('customer', 'provider', 'admin', 'support') NOT NULL DEFAULT 'customer';
