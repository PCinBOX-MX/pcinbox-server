"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PCINBOX_PROVIDER_ID = exports.PCINBOX_PICKUP_BRANCH_NAME = void 0;
exports.resolvePcinboxPickupBranchId = resolvePcinboxPickupBranchId;
exports.resolvePosCashBranchId = resolvePosCashBranchId;
exports.isPickupShippingMethod = isPickupShippingMethod;
const prismaClient_1 = require("../db/prismaClient");
/** Sucursal física donde el cliente recoge (PCinBOX-León), distinta de la sucursal de compra/stock. */
exports.PCINBOX_PICKUP_BRANCH_NAME = "leon2";
/** Provider id de catálogo propio PCinBOX. */
exports.PCINBOX_PROVIDER_ID = 1;
let cachedPickupBranchId;
let cachedPosCashBranchId;
async function resolvePcinboxPickupBranchId() {
    if (cachedPickupBranchId !== undefined) {
        return cachedPickupBranchId;
    }
    const branch = await prismaClient_1.prisma.branches.findFirst({
        where: { name: exports.PCINBOX_PICKUP_BRANCH_NAME },
        select: { idBranche: true },
    });
    cachedPickupBranchId = branch ? Number(branch.idBranche) : null;
    return cachedPickupBranchId;
}
/**
 * Sucursal de caja POS (fija, no se elige en UI).
 * 1) Primera branch con `providerId = 1` (catálogo PCinBOX).
 * 2) Si no existe en BD (caso actual: no hay branches con provider 1),
 *    usa la sucursal de recolección `leon2` (tienda física PCinBOX-León).
 */
async function resolvePosCashBranchId() {
    if (cachedPosCashBranchId !== undefined) {
        return cachedPosCashBranchId;
    }
    const byProvider = await prismaClient_1.prisma.branches.findFirst({
        where: { providerId: exports.PCINBOX_PROVIDER_ID },
        orderBy: { idBranche: "asc" },
        select: { idBranche: true },
    });
    if (byProvider) {
        cachedPosCashBranchId = Number(byProvider.idBranche);
        return cachedPosCashBranchId;
    }
    cachedPosCashBranchId = await resolvePcinboxPickupBranchId();
    return cachedPosCashBranchId;
}
function isPickupShippingMethod(method) {
    const normalized = String(method ?? "").toLowerCase();
    return normalized === "sucursal" || normalized === "sucursalext";
}
//# sourceMappingURL=pcinbox-pickup.constants.js.map