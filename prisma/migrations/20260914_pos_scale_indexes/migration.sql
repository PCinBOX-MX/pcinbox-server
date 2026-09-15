-- Índices POS para listados/filtros/búsquedas a escala

-- Ventas
CREATE INDEX `idx_pos_sales_branch_createdAt` ON `pos_sales` (`branchId`, `createdAt`);
CREATE INDEX `idx_pos_sales_customerName` ON `pos_sales` (`customerName`);
CREATE INDEX `idx_pos_sales_idLinkPago` ON `pos_sales` (`idLinkPago`);
CREATE INDEX `idx_pos_sales_linkReferencia` ON `pos_sales` (`linkReferencia`);

-- Productos (búsqueda POS)
CREATE INDEX `idx_products_active` ON `products` (`active`);
CREATE INDEX `idx_products_sku` ON `products` (`sku`);
CREATE INDEX `idx_products_upc` ON `products` (`upc`);
CREATE INDEX `idx_products_idProductExt` ON `products` (`idProductExt`);

-- Series
CREATE INDEX `idx_product_serials_branchId` ON `product_serials` (`branchId`);
CREATE INDEX `idx_product_serials_posSaleItemId` ON `product_serials` (`posSaleItemId`);
CREATE INDEX `idx_product_serials_updatedAt` ON `product_serials` (`updatedAt`);
CREATE INDEX `idx_product_serials_product_status` ON `product_serials` (`productId`, `status`);

-- Caja
CREATE INDEX `idx_pos_cash_movements_session_createdAt` ON `pos_cash_movements` (`cashSessionId`, `createdAt`);
CREATE INDEX `idx_pos_cash_movements_posSaleId` ON `pos_cash_movements` (`posSaleId`);

-- Inventario
CREATE INDEX `idx_inventory_movements_createdAt` ON `inventory_movements` (`createdAt`);
CREATE INDEX `idx_inventory_movements_branch_createdAt` ON `inventory_movements` (`branchId`, `createdAt`);

-- Clientes POS
CREATE INDEX `idx_users_email` ON `users` (`email`);
CREATE INDEX `idx_users_role_active` ON `users` (`role`, `active`);
