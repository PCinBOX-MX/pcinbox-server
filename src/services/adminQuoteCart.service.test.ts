import assert from "node:assert/strict";
import test from "node:test";
import {
  sliceQuoteCart,
  upsertQuoteCartLine,
  type StoredQuoteLine,
} from "./adminQuoteCart.service";

function line(id: number, price = 10, quantity: number | null = 1): StoredQuoteLine {
  return {
    idProduct: id,
    name: `Producto ${id}`,
    description: null,
    caracteristicas: null,
    price,
    image_url: null,
    upc: null,
    sku: null,
    active: true,
    stock: 1,
    stocksByBranch: [],
    quantity,
  };
}

test("la página del carrito trae 4 productos y no las demás", () => {
  const lines = [1, 2, 3, 4, 5, 6].map((id) => line(id, 10, 2));
  const page = sliceQuoteCart(lines, 2);
  assert.deepEqual(
    page.data.map((item) => item.idProduct),
    [5, 6],
  );
  assert.equal(page.pagination.page, 2);
  assert.equal(page.pagination.limit, 4);
  assert.equal(page.pagination.total, 6);
  assert.equal(page.pagination.totalPages, 2);
  assert.equal(page.totalAmount, 120);
});

test("una página fuera de rango regresa a la última con datos", () => {
  const page = sliceQuoteCart([line(1), line(2)], 8);
  assert.equal(page.pagination.page, 1);
  assert.equal(page.data.length, 2);
});

test("agregar un producto repetido suma cantidad y abre su página", () => {
  const first = upsertQuoteCartLine([line(1, 10, 2)], line(1));
  assert.ok(!("error" in first));
  if ("error" in first) return;
  assert.equal(first.lines[0].quantity, 3);
  assert.equal(first.page, 1);
});

test("re-agregar no sobrescribe precio ni nombre de la línea existente", () => {
  const existing: StoredQuoteLine = {
    ...line(1, 99.5, 2),
    name: "Precio negociado",
    manual: true,
  };
  const fromCatalog = line(1, 10, 1);
  fromCatalog.name = "Nombre del catálogo";
  const result = upsertQuoteCartLine([existing], fromCatalog);
  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.lines[0]?.quantity, 3);
  assert.equal(result.lines[0]?.price, 99.5);
  assert.equal(result.lines[0]?.name, "Precio negociado");
  assert.equal(result.lines[0]?.manual, true);
});
