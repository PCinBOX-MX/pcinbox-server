# Confianza en el cliente — pcinbox-server

## Reglas
1. Identidad solo desde JWT (Bearer o cookie `pcinbox_auth`) → `req.idUser`.
2. Nunca autorizar con `req.body.idUser` / `userId` / `adminRole`.
3. Roles admin/POS desde DB (`MiddleAdminRoute`, `MiddlePosRoute`).
4. Precios/stock/totales de pago: recalcular en server (checkout/cart/POS).

## Endpoints nuevos
- `GET /api/v1/user/session` — perfil + role fresco (para UI admin/client)
- `POST /api/v1/user/logout` — limpia cookie httpOnly

## Cookie httpOnly (dual)
Login/LoginGoogle setean `pcinbox_auth` además del token en JSON.
Clientes pueden seguir enviando `Authorization: Bearer` durante la migración.
CORS ya usa `credentials: true`.
