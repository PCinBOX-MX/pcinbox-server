"use strict";
/**
 * Etiquetas de bodega PCinBOX alineadas con pcinbox-client
 * (`getBranchDisplayName` / gridConfirmaProductos).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POS_TICKET_BRANCH_FALLBACK = exports.DICOTECH_PROVIDER_ID = exports.TECHSMART_PROVIDER_ID = exports.PCINBOX_PROVIDER_ID = void 0;
exports.normalizePosBranchKey = normalizePosBranchKey;
exports.isPosSellableBranchName = isPosSellableBranchName;
exports.formatPcinboxBranchDisplayName = formatPcinboxBranchDisplayName;
exports.resolveTicketBranchLabel = resolveTicketBranchLabel;
exports.PCINBOX_PROVIDER_ID = 1;
exports.TECHSMART_PROVIDER_ID = 2;
exports.DICOTECH_PROVIDER_ID = 3;
/** Bodegas vendibles por proveedor (nombres crudos en BD). */
const POS_ALLOWED_BRANCH_NAMES = {
    [exports.PCINBOX_PROVIDER_ID]: ["leon", "leon2", "león"],
    [exports.TECHSMART_PROVIDER_ID]: ["cdmx", "gdl"],
    [exports.DICOTECH_PROVIDER_ID]: ["leon2", "santafe"],
};
function normalizePosBranchKey(rawName) {
    return String(rawName ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
}
function isPosSellableBranchName(providerId, branchName) {
    const allowed = POS_ALLOWED_BRANCH_NAMES[providerId];
    if (!allowed) {
        // Proveedores desconocidos: no listar bodegas arbitrarias en POS.
        return false;
    }
    const key = normalizePosBranchKey(branchName);
    if (!key)
        return false;
    return allowed.some((a) => normalizePosBranchKey(a) === key);
}
function formatPcinboxBranchDisplayName(rawName) {
    const name = String(rawName ?? "").trim();
    if (!name)
        return null;
    const key = normalizePosBranchKey(name);
    if (key === "leon2" || key === "león" || key === "leon") {
        return "PCinBOX-León";
    }
    // Nombre genérico de sucursal / marca → punto León (caja POS).
    if (key === "pcinbox" || key === "pcinboxleon" || key === "pcinboxleón") {
        return "PCinBOX-León";
    }
    if (key === "santafe" || key === "santafe.") {
        return "PCinBOX-SFD";
    }
    if (key === "gdl") {
        return "PCinBOX-GDL";
    }
    if (key === "cdmx") {
        return "PCinBOX-CDMX";
    }
    if (key === "dicoags2") {
        return "PCinBOX-AG2D";
    }
    if (key === "arboledas") {
        return "PCinBOX-AGD";
    }
    return name;
}
/** Fallback de ticket cuando no hay bodega en la línea (p. ej. manual / stock global). */
exports.POS_TICKET_BRANCH_FALLBACK = "PCinBOX-León";
function resolveTicketBranchLabel(params) {
    return (formatPcinboxBranchDisplayName(params.itemBranchName) ||
        formatPcinboxBranchDisplayName(params.saleBranchName) ||
        exports.POS_TICKET_BRANCH_FALLBACK);
}
//# sourceMappingURL=pcinbox-branch-display.js.map