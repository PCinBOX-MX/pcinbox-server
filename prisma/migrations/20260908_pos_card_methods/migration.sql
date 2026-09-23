-- Extiende métodos de pago POS: tarjeta crédito / débito
-- Tabla real: pos_payments (no pos_sale_payments)
ALTER TABLE `pos_payments`
  MODIFY COLUMN `method` ENUM(
    'efectivo_sucursal',
    'tarjeta_sucursal',
    'tarjeta_credito_sucursal',
    'tarjeta_debito_sucursal',
    'transferencia_bancaria',
    'openpay_link'
  ) NOT NULL;
