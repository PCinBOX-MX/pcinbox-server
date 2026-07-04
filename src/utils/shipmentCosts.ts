export function toMoneyNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

export function sumShipmentCostTotals(
  shipments:
    | Array<{
        shippingCost?: unknown;
        insuranceCost?: unknown;
      }>
    | null
    | undefined,
): { shippingTotal: number; insuranceTotal: number } {
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
