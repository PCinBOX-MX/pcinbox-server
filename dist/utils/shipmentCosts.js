"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMoneyNumber = toMoneyNumber;
exports.sumShipmentCostTotals = sumShipmentCostTotals;
function toMoneyNumber(value) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed))
        return 0;
    return Math.round(parsed * 100) / 100;
}
function sumShipmentCostTotals(shipments) {
    let shippingTotal = 0;
    let insuranceTotal = 0;
    for (const shipment of shipments ?? []) {
        shippingTotal += toMoneyNumber(shipment.shippingCost);
        insuranceTotal += toMoneyNumber(shipment.insuranceCost);
    }
    return {
        shippingTotal: Math.round(shippingTotal * 100) / 100,
        insuranceTotal: Math.round(insuranceTotal * 100) / 100,
    };
}
//# sourceMappingURL=shipmentCosts.js.map