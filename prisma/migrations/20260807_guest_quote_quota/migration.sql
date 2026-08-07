ALTER TABLE `cotizaciones`
  MODIFY `userId` BIGINT NULL,
  ADD COLUMN `guestScopeHash` CHAR(64) NULL AFTER `userId`,
  ADD COLUMN `cartHash` CHAR(64) NULL AFTER `guestScopeHash`,
  ADD COLUMN `checkoutMode` VARCHAR(16) NULL AFTER `cartHash`;

-- Las filas previas pertenecen a usuarios autenticados. Se les asigna una
-- configuración irrepetible para conservarlas sin afectar la cuota nueva.
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

CREATE INDEX `cotizaciones_guest_cart_created_idx`
  ON `cotizaciones`(`guestScopeHash`, `cartHash`, `createdAt`);
