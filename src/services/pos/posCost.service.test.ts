import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizePosCosts } from "./posCost.service";

test("el margen de proveedores 2 y 3 resta 3% de comisión sobre lo cobrado", () => {
  const summary = summarizePosCosts([
    {
      quantity: 2,
      costUnit: 400,
      profitMarginUnit: 50,
      lineTotal: 1000,
    },
    {
      quantity: 1,
      costUnit: null,
      profitMarginUnit: null,
      lineTotal: 500,
    },
  ]);

  assert.ok(summary);
  assert.equal(summary.investment, 800);
  assert.equal(summary.totalCost, 1000);
  assert.equal(summary.profitMargin, 170);
  assert.equal(summary.lines, 1);
  assert.equal(summary.units, 2);
});
