-- Revert: tracking de import vive en linesJson, no en columnas.
DROP INDEX `cotizaciones_importedAt_idx` ON `cotizaciones`;
ALTER TABLE `cotizaciones`
  DROP COLUMN `importedAt`,
  DROP COLUMN `importedByUserId`;
