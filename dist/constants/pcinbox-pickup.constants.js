"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PCINBOX_PICKUP_BRANCH_NAME = void 0;
exports.resolvePcinboxPickupBranchId = resolvePcinboxPickupBranchId;
exports.isPickupShippingMethod = isPickupShippingMethod;
const prismaClient_1 = require("../db/prismaClient");
/** Sucursal física donde el cliente recoge (PCinBOX-León), distinta de la sucursal de compra/stock. */
exports.PCINBOX_PICKUP_BRANCH_NAME = "leon2";
let cachedPickupBranchId;
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
function isPickupShippingMethod(method) {
    const normalized = String(method ?? "").toLowerCase();
    return normalized === "sucursal" || normalized === "sucursalext";
}
//# sourceMappingURL=pcinbox-pickup.constants.js.map