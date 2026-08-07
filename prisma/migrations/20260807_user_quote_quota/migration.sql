ALTER TABLE `cotizaciones`
  ADD COLUMN `cartHash` CHAR(64) NULL AFTER `userId`,
  ADD COLUMN `checkoutMode` VARCHAR(16) NULL AFTER `cartHash`;

-- Las filas previas reciben una configuración irrepetible para conservarlas
-- sin afectar la cuota nueva.
UPDATE `cotizaciones`
SET
  `cartHash` = SHA2(CONCAT('legacy:', `idCotizacion`), 256),
  `checkoutMode` = 'cart'
WHERE `cartHash` IS NULL OR `checkoutMode` IS NULL;

ALTER TABLE `cotizaciones`
  MODIFY `cartHash` CHAR(64) NOT NULL,
  MODIFY `checkoutMode` VARCHAR(16) NOT NULL;

CREATE INDEX `cotizaciones_user_cart_created_idx`
  ON `cotizaciones`(`userId`, `cartHash`, `createdAt`);
