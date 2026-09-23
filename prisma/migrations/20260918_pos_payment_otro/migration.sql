-- Extiende métodos de pago POS: «otro» (texto libre en reference)
ALTER TABLE `pos_payments`
  MODIFY COLUMN `method` ENUM(
    'efectivo_sucursal',
    'tarjeta_sucursal',
    'tarjeta_credito_sucursal',
    'tarjeta_debito_sucursal',
    'transferencia_bancaria',
    'openpay_link',
    'otro'
  ) NOT NULL;
