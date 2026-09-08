# Punto de Venta (POS) — Arquitectura PCinBOX

Documento de análisis de la arquitectura actual y de la integración del módulo de Punto de Venta en el panel administrativo, sin duplicar catálogo ni inventarios.

## 1. Objetivo

Las ventas físicas en sucursal deben:

- Usar el **mismo catálogo** (`products`: nombre, precio, SKU, UPC, número de parte).
- Afectar el **mismo inventario** central y por sucursal (`products.stock`, `product_stock`).
- Quedar **identificadas como venta en sucursal**, diferenciadas de la tienda en línea.
- Registrar folios únicos, cajero, pagos, cancelaciones controladas y un ledger auditable.

## 2. Mapa de servicios

| Servicio | Repo | Ownership |
|----------|------|-----------|
| Panel admin + UI POS | `pcinbox_admin` | Pantalla `/punto-de-venta` |
| API POS + modelos | `pcinbox-server` | `/api/v1/pos/*`, tablas `pos_*`, series, caja, ledger |
| Pagos OpenPay (link) | `server-pasarela-de-pagos` | Link de pago + webhook → completa venta POS |
| Sync catálogo / stock sucursal | `server-proveedores` | Dicotech/TechSmart → `products`, `branches`, `product_stock` |
| Tienda en línea | `pcinbox-client` | Carrito/checkout web (sin cambios POS) |

```
pcinbox_admin ──► pcinbox-server /api/v1/pos
                      │
                      ├─► products / product_stock / inventory_movements
                      ├─► pos_sales / pos_payments / pos_sale_events
                      └─► (OpenPay) pasarela ──webhook──► /pos/internal/completeByOpenPayLink

server-proveedores ──sync──► products + product_stock
```

## 3. Arquitectura actual de la tienda (web)

1. Cliente arma carrito en `pcinbox-client` / `pcinbox-server`.
2. Pago en `server-pasarela-de-pagos` → crea `order` + líneas `sales`.
3. Al confirmar pago se decrementa stock global y de sucursal; se escribe `inventory_movements` con reason `web_sale` / `web_sale_branch`.

El catálogo y el stock son **compartidos**. Lo que diferencia el canal es el modelo de venta y el motivo del movimiento.

## 4. Propuesta de integración POS (aplicada)

**Principio:** no duplicar productos ni capturar de nuevo SKU/UPC/precios.

| Concern | Enfoque |
|---------|---------|
| Catálogo | Reutilizar `products` (búsqueda por nombre, SKU, UPC, part number) |
| Inventario | **Por línea:** `pos_sale_items.branchId` = bodega del proveedor del SKU (TechSmart CDMX/GDL, Dicotech leon2/santafe, PCinbox sin filas → solo global) |
| Punto de cobro | `pos_sales.branchId` + caja: solo obligatorio para efectivo; no define origen de cada producto |
| Identidad de venta | Tabla propia `pos_sales` (no mezclar con `order`/`sales`) |
| Canal en ledger | `reason`: `pos_sale` / `pos_cancel` vs `web_sale` |
| Folio | Secuencia dedicada `pos_folio_seq` → `PV-0000001` |
| Auditoría | `pos_sale_events` + `inventory_movements` |
| Caja | `pos_cash_sessions` / `pos_cash_movements` |
| Series | `product_serials` (productos con `requiresSerial`) |

### Por qué no reutilizar `order`/`sales`

Las órdenes web cargan envíos, facturación, paquetería y estados de envío por línea. Forzar el POS ahí acoplaría sucursal a un flujo de e‑commerce. `pos_sales` es un modelo más simple (cobro en mostrador) que comparte inventario y catálogo.

## 5. Flujos operativos

### 5.1 Cobro inmediato (efectivo / tarjeta / transferencia)

1. Cajero elige sucursal y busca/escanea producto.
2. Arma carrito, cliente opcional, descuentos según rol.
3. Registra uno o varios pagos (suma = total).
4. `POST /pos/sales` → status `completed`, descuenta stock, asigna series, registra caja si hay efectivo.
5. Ticket HTML / impresión.

### 5.2 OpenPay link (pendiente)

1. Único método `openpay_link` (no se combina con otros en MVP).
2. Venta en `pending_payment` **sin** descontar stock.
3. Pasarela crea link; al pagar, webhook llama `POST /pos/internal/completeByOpenPayLink`.
4. Se completa venta, descuenta stock y asigna series diferidas.
5. También hay confirmación manual (`confirmPayment`) y `retryPaymentLink`.

### 5.3 Cancelación controlada

- Motivo obligatorio (≥ 3 caracteres).
- `support`: puede cancelar `pending_payment` siempre; `completed` solo el mismo día (America/Mexico_City).
- `admin`: override en cualquier momento.
- Restaura stock / series / movimiento de caja si aplica.
- Evento `cancelled` en `pos_sale_events`.

### 5.4 Caja y series

- Una sesión abierta por sucursal; cortes con conteo vs esperado.
- Series: alta, venta, RMA; productos marcables con `requiresSerial` / `warrantyMonths`.

## 6. Roles y permisos

| Rol BD (`users_role`) | POS | Descuento | Cancelación |
|-----------------------|-----|-----------|-------------|
| `admin` | Sí | Hasta 100% | Override |
| `support` | Sí | Máx. 3% | Misma ventana (día / pending) |
| `customer` / `provider` | No | — | — |

UI (`pcinbox_admin`): `pos.manage`, `pos.cancel`, `pos.cancel.override`.

## 7. Endpoints principales

Base: `/api/v1/pos` en `pcinbox-server`.

- Productos / clientes: `GET /products/search`, `GET /customers/search`, `GET /branches`
- Ventas: `POST /sales`, `GET /sales`, `GET /sales/:id`, `GET /sales/:id/ticket`
- Pagos: `POST /sales/:id/cancel`, `confirmPayment`, `retryPaymentLink`
- Caja: `/cash/status|open|movements|close|sessions`
- Inventario: `GET /inventory/movements`
- Series: `/serials/*`
- Interno: `POST /internal/completeByOpenPayLink` (`X-POS-Internal-Secret`)

## 8. Decisiones MVP conscientes

- OpenPay link **no** se mezcla con efectivo/tarjeta/transferencia.
- No hay alta de cliente desde POS (se busca cliente existente o público general).
- No hay comisiones ni maestro de vendedores: el cajero es `cashierUserId`.
- `server-proveedores` no implementa lógica POS; solo alimenta catálogo/stock.

## 9. Variables de entorno relevantes

**pcinbox-server**

- `API_URL_PAGOS` — base de la pasarela
- `POS_INTERNAL_SECRET` — secreto compartido con pasarela

**server-pasarela-de-pagos**

- `API_URL_PCINBOX_SERVER` — base del server
- `POS_INTERNAL_SECRET` — mismo secreto

## 10. Gaps cerrados en el endurecimiento profesional

1. Folios concurrentes vía `pos_folio_seq` (FOR UPDATE en transacción).
2. Rol `support` en BD + middleware POS `admin|support`.
3. Descuentos API alineados con UI (admin 100% / support 3%).
4. Cancelaciones controladas por rol y día.
5. Decremento de stock de sucursal atómico (`updateMany` condicional).
