-- OTP de verificación de correo antes de crear cuenta (registro).
CREATE TABLE IF NOT EXISTS `register_email_codes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(100) NOT NULL,
  `codeHash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `lastname` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(45) NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `resendCount` INT NOT NULL DEFAULT 0,
  `verifyAttempts` INT NOT NULL DEFAULT 0,
  `lastResendAt` DATETIME(0) NULL,
  `expiresAt` DATETIME(0) NOT NULL,
  `consumedAt` DATETIME(0) NULL,
  `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `register_email_codes_email_idx` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
