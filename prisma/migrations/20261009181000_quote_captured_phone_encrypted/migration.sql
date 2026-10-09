-- Ampliar para ciphertext AES-GCM (v1.iv.tag.data).
ALTER TABLE `cotizaciones`
  MODIFY COLUMN `capturedPhone` VARCHAR(255) NULL;
