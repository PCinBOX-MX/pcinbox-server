import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuoteStocksByBranch,
  parseCheckoutContext,
  quotaResponse,
} from "./cotizaciones.controller";

const context = (mode: "cart" | "buy_now", quantity = 1, storeId = 1) =>
  JSON.stringify({
    mode,
    lines: [
      { productId: "20", quantity, storeId },
      { productId: "10", quantity: 1, storeId: null },
    ],
  });

test("genera la misma firma aunque cambie el orden de las líneas", () => {
  const first = parseCheckoutContext(context("cart"), 2);
  const reversed = parseCheckoutContext(
    JSON.stringify({
      mode: "cart",
      lines: [
        { productId: "10", quantity: 1, storeId: null },
        { productId: "20", quantity: 1, storeId: 1 },
      ],
    }),
    2,
  );
  assert.ok(first);
  assert.equal(first.cartHash, reversed?.cartHash);
});

test("cantidad, sucursal y modo producen configuraciones distintas", () => {
  const base = parseCheckoutContext(context("cart"), 2);
  const quantity = parseCheckoutContext(context("cart", 2), 3);
  const store = parseCheckoutContext(context("cart", 1, 2), 2);
  const buyNow = parseCheckoutContext(context("buy_now"), 2);
  assert.ok(base && quantity && store && buyNow);
  assert.notEqual(base.cartHash, quantity.cartHash);
  assert.notEqual(base.cartHash, store.cartHash);
  assert.notEqual(base.cartHash, buyNow.cartHash);
});

test("rechaza contexto manipulado que no coincide con la cantidad total", () => {
  assert.equal(parseCheckoutContext(context("cart"), 99), null);
});

test("persiste unitPrice y no altera cartHash si solo cambia el precio", () => {
  const withoutPrice = parseCheckoutContext(context("cart"), 2);
  const withPrice = parseCheckoutContext(
    JSON.stringify({
      mode: "cart",
      lines: [
        { productId: "20", quantity: 1, storeId: 1, unitPrice: 1999.5 },
        { productId: "10", quantity: 1, storeId: null, unitPrice: 100 },
      ],
    }),
    2,
  );
  assert.ok(withoutPrice && withPrice);
  assert.equal(withoutPrice.cartHash, withPrice.cartHash);
  assert.equal(withPrice.lines[0].unitPrice, 100);
  assert.equal(withPrice.lines[1].unitPrice, 1999.5);
  assert.equal(withoutPrice.lines[0].unitPrice, null);
});

const branch = (
  id: number,
  name: string,
  providerId: number,
) => ({
  idBranche: BigInt(id),
  name,
  city: null,
  providerId: BigInt(providerId),
});

test("DicoTech solo muestra Santa Fe y León con su nombre de tienda", () => {
  const stocks = buildQuoteStocksByBranch(
    3,
    [
      branch(10, "gdl", 2),
      branch(11, "leon", 3),
      branch(12, "leon2", 3),
      branch(13, "santafe", 3),
      branch(14, "otra", 3),
    ],
    new Map([
      ["12", 4],
      ["13", 0],
      ["14", 9],
    ]),
  );
  assert.deepEqual(stocks, [
    { branchId: 13, label: "PCinBOX-SFD", stock: 0 },
    { branchId: 12, label: "PCinBOX-León", stock: 4 },
  ]);
});

test("TechSmart solo muestra GDL y CDMX con su nombre de tienda", () => {
  const stocks = buildQuoteStocksByBranch(
    2,
    [
      branch(20, "cdmx", 2),
      branch(21, "gdl", 2),
      branch(22, "santafe", 3),
      branch(23, "leon2", 2),
    ],
    new Map([
      ["20", 3],
      ["21", 8],
    ]),
  );
  assert.deepEqual(stocks, [
    { branchId: 21, label: "PCinBOX-GDL", stock: 8 },
    { branchId: 20, label: "PCinBOX-CDMX", stock: 3 },
  ]);
});

test("la cuota llega a cero exactamente después de tres generaciones", () => {
  const oldest = new Date("2026-08-06T10:00:00.000Z");
  assert.equal(quotaResponse(1, oldest).remaining, 2);
  assert.equal(quotaResponse(2, oldest).remaining, 1);
  assert.equal(quotaResponse(3, oldest).remaining, 0);
  assert.equal(
    quotaResponse(3, oldest).resetAt.toISOString(),
    "2026-08-07T10:00:00.000Z",
  );
});
