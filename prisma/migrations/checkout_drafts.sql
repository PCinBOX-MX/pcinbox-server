-- Ejecutar una vez en la base de datos si la tabla no existe
CREATE TABLE IF NOT EXISTS checkout_drafts (
  userId BIGINT NOT NULL PRIMARY KEY,
  draft JSON NOT NULL,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
