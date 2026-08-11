ALTER TABLE `cotizaciones`
  ADD COLUMN `active` TINYINT NOT NULL DEFAULT 1 AFTER `includeAssemblyService`;

CREATE INDEX `cotizaciones_active_createdAt_idx`
  ON `cotizaciones`(`active`, `createdAt`);
