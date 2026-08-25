"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TECHSMART_DISABLED_BRANCH_NAMES = exports.TECHSMART_PROVIDER_ID = void 0;
exports.normalizeBranchName = normalizeBranchName;
exports.isTechSmartBranchDisabled = isTechSmartBranchDisabled;
exports.getTechSmartBranchValidationError = getTechSmartBranchValidationError;
const prismaClient_1 = require("../db/prismaClient");
const core_1 = require("@pcinbox/core");
Object.defineProperty(exports, "TECHSMART_PROVIDER_ID", { enumerable: true, get: function () { return core_1.TECHSMART_PROVIDER_ID; } });
exports.TECHSMART_DISABLED_BRANCH_NAMES = [];
function normalizeBranchName(name) {
    return String(name || "").trim().toUpperCase();
}
function isTechSmartBranchDisabled(branchName) {
    return exports.TECHSMART_DISABLED_BRANCH_NAMES.includes(normalizeBranchName(branchName));
}
async function getTechSmartBranchValidationError(providerId, storeId) {
    if (Number(providerId) !== core_1.TECHSMART_PROVIDER_ID || storeId == null) {
        return null;
    }
    const branch = await prismaClient_1.prisma.branches.findFirst({
        where: { idBranche: storeId },
        select: { name: true },
    });
    if (isTechSmartBranchDisabled(branch?.name)) {
        return "Hay una sucursal no disponible para productos TechSmart.";
    }
    return null;
}
//# sourceMappingURL=techsmart-branches.js.map