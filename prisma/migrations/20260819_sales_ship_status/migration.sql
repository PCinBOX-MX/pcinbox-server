ALTER TABLE `sales` ADD COLUMN `shipStatus` ENUM('entregado','cancelado','enviado','procesando','disponible') NULL AFTER `status`;
