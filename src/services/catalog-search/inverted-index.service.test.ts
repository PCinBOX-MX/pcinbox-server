import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchTerm } from "./search-normalize";
import {
  buildInvertedIndex,
  searchInvertedIndex,
  type IndexableProduct,
} from "./inverted-index.service";

const catalog: IndexableProduct[] = [
  {
    idProduct: 1,
    name: "Gigabyte GeForce RTX 4060 8GB",
    sku: "GV-N4060",
    nameMarca: "Gigabyte",
    nameCategory: "Tarjeta de video",
  },
  {
    idProduct: 2,
    name: "ASUS RTX 4070 12GB",
    sku: "ASUS-4070",
    nameMarca: "ASUS",
    nameCategory: "Tarjeta de video",
  },
  {
    idProduct: 3,
    name: "Kingston Memoria RAM DDR5 16GB",
    sku: "KVR16",
    nameMarca: "Kingston",
    nameCategory: "Memoria RAM",
  },
  {
    idProduct: 4,
    name: "Tarjeta gráfica Asus Dual",
    sku: "DUAL-GFX",
    nameMarca: "ASUS",
    nameCategory: "Tarjeta de video",
  },
];

test("la consulta queda en la forma canónica una sola vez", () => {
  assert.equal(normalizeSearchTerm("GPU"), "tarjeta de video");
  assert.equal(normalizeSearchTerm("Targeta"), "tarjeta");
  assert.equal(normalizeSearchTerm("1 TB"), "1tb");
  assert.equal(normalizeSearchTerm("Memoria RAM"), "memoria ram");
  assert.equal(normalizeSearchTerm("memoria memoria ram"), "memoria memoria ram");
});

test("rtx 4060 devuelve esa tarjeta y no la 4070 ni la memoria", () => {
  const index = buildInvertedIndex(catalog);
  const hits = searchInvertedIndex(index, "rtx 4060", 10).map((item) => item.idProduct);
  assert.deepEqual(hits, [1]);
});

test("el código con guiones encuentra el sku", () => {
  const index = buildInvertedIndex(catalog);
  const hits = searchInvertedIndex(index, "GV-N4060", 5).map((item) => item.idProduct);
  assert.equal(hits[0], 1);
});

test("un prefijo y un typo corto resuelven la marca", () => {
  const index = buildInvertedIndex(catalog);
  assert.equal(searchInvertedIndex(index, "giga", 5)[0]?.idProduct, 1);
  assert.equal(searchInvertedIndex(index, "gygabyte", 5)[0]?.idProduct, 1);
});

test("gpu encuentra la tarjeta gráfica por el sinónimo", () => {
  const index = buildInvertedIndex(catalog);
  const hits = searchInvertedIndex(index, "gpu", 10).map((item) => item.idProduct);
  assert.ok(hits.includes(4));
  assert.ok(hits.includes(1));
  assert.equal(hits.includes(3), false);
});

test("el filtro se queda solo con la categoría pedida", () => {
  const index = buildInvertedIndex(
    catalog.map((item) => ({
      ...item,
      categoryId: item.idProduct === 4 ? 9 : 3,
    })),
  );
  const hits = searchInvertedIndex(
    index,
    "tarjeta",
    10,
    (item) => (item as { categoryId?: number }).categoryId === 3,
  ).map((item) => item.idProduct);
  assert.equal(hits.includes(4), false);
  assert.ok(hits.includes(1));
});

test("un catálogo grande no cambia el primer resultado", () => {
  const many: IndexableProduct[] = [];
  for (let id = 10; id < 1510; id += 1) {
    many.push({
      idProduct: id,
      name: `Cable HDMI ${id} metros`,
      sku: `HDMI-${id}`,
      nameCategory: "Cables",
    });
  }
  const index = buildInvertedIndex([...many, ...catalog]);
  const hits = searchInvertedIndex(index, "rtx 4060", 5);
  assert.equal(hits[0]?.idProduct, 1);
  assert.equal(hits.some((item) => item.name?.includes("HDMI")), false);
});
