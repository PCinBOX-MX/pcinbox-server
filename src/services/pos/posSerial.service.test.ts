import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import {
  loadSharedBarcodeKeys,
  mergeSharedBarcodeSerials,
  normalizeItemSerials,
  parkAlreadySoldSerials,
  readSharedSerialGroups,
  serialIsSharedBarcode,
  serialMatchesProductCode,
  splitRepeatedSerials,
} from "./posSerial.service";

test("la serie que es el UPC coincide aunque tenga espacios o guiones", () => {
  assert.equal(serialMatchesProductCode("7503053078178", "7503053078178"), true);
  assert.equal(
    serialMatchesProductCode("7503-0530-78178", "7503053078178"),
    true,
  );
  assert.equal(serialMatchesProductCode("SN-REAL-1", "7503053078178"), false);
});

test("varias piezas del mismo producto pueden repetir la serie o el UPC", () => {
  const upc = normalizeItemSerials(
    2,
    true,
    ["7503053078178", "7503 0530 78178"],
    "Monitor",
    ["7503053078178"],
  );
  assert.deepEqual(upc, ["7503053078178", "7503 0530 78178"]);

  const repeated = normalizeItemSerials(
    2,
    true,
    ["SN-1", "SN-1"],
    "Gabinete",
    ["7503053078420"],
  );
  assert.deepEqual(repeated, ["SN-1", "SN-1"]);
});

test("la misma serie en otro producto no bloquea el cobro", () => {
  const lines = splitRepeatedSerials(
    [
      {
        productId: 9,
        productName: "Gabinete",
        productUpc: null,
        serials: ["SN-1"],
      },
      {
        productId: 4,
        productName: "Monitor",
        productUpc: null,
        serials: ["sn-1"],
      },
    ],
    new Set<string>(),
  );
  assert.deepEqual(lines[0]?.trackableSerials, ["SN-1"]);
  assert.deepEqual(lines[1]?.trackableSerials, []);
  assert.deepEqual(lines[1]?.sharedSerials, ["sn-1"]);
});

test("las copias extra quedan en la venta y la primera en inventario", () => {
  const lines = splitRepeatedSerials(
    [
      {
        productId: 9,
        productName: "Gabinete",
        productUpc: "7503053078420",
        serials: ["SN-1", "SN-1"],
      },
      {
        productId: 9,
        productName: "Gabinete",
        productUpc: "7503053078420",
        serials: ["SN-2"],
      },
    ],
    new Set<string>(),
  );
  assert.deepEqual(lines[0]?.trackableSerials, ["SN-1"]);
  assert.deepEqual(lines[0]?.sharedSerials, ["SN-1"]);
  assert.deepEqual(lines[1]?.trackableSerials, ["SN-2"]);
  assert.deepEqual(lines[1]?.sharedSerials, []);

  const upcLines = splitRepeatedSerials(
    [
      {
        productId: 9,
        productName: "Gabinete",
        productUpc: "7503053078420",
        serials: ["7503053078420", "7503053078420"],
      },
    ],
    new Set<string>(),
  );
  assert.deepEqual(upcLines[0]?.trackableSerials, []);
  assert.deepEqual(upcLines[0]?.sharedSerials, [
    "7503053078420",
    "7503053078420",
  ]);
});

test("una serie ya registrada se anota en la venta sin rechazar el cobro", () => {
  const lines = [
    {
      productId: 9,
      trackableSerials: ["SN-1"],
      sharedSerials: [] as string[],
    },
  ];
  parkAlreadySoldSerials(lines, [
    { serialNumber: "SN-1", productId: 9, status: "sold" },
  ]);
  assert.deepEqual(lines[0]?.trackableSerials, []);
  assert.deepEqual(lines[0]?.sharedSerials, ["SN-1"]);

  const other = [
    {
      productId: 4,
      trackableSerials: ["SN-1"],
      sharedSerials: [] as string[],
    },
  ];
  parkAlreadySoldSerials(other, [
    { serialNumber: "SN-1", productId: 9, status: "sold" },
  ]);
  assert.deepEqual(other[0]?.trackableSerials, []);
  assert.deepEqual(other[0]?.sharedSerials, ["SN-1"]);
});

test("un UPC ya vendido no se trata como serie única", async () => {
  const tx = {
    products: {
      findMany: async () => [{ upc: "7503053078178" }],
    },
  } as unknown as Prisma.TransactionClient;
  const keys = await loadSharedBarcodeKeys(tx, ["7503053078178", "SN-REAL"]);
  assert.equal(serialIsSharedBarcode("7503053078178", null, keys), true);
  assert.equal(serialIsSharedBarcode("SN-REAL", "7503053078178", keys), false);
  assert.equal(
    serialIsSharedBarcode("7503-0530-78178", "7503053078178", new Set()),
    true,
  );
});

test("el UPC guardado en la venta se muestra junto con las series únicas", () => {
  const groups = readSharedSerialGroups([
    {
      eventType: "created",
      payload: {
        sharedSerials: [
          {
            productId: 9,
            productName: "Monitor",
            serials: ["7503053078178"],
            warrantyMonths: 12,
            warrantyMode: "months",
          },
        ],
      },
    },
  ]);
  const [item] = mergeSharedBarcodeSerials(
    [
      {
        productId: 9,
        productName: "Monitor",
        serials: [{ idProductSerial: 4, serialNumber: "SN-REAL" }],
      },
    ],
    groups,
  );
  assert.deepEqual(
    item.serials?.map((serial) => serial.serialNumber),
    ["SN-REAL", "7503053078178"],
  );
});

test("la copia repetida se muestra en la línea que la capturó", () => {
  const groups = readSharedSerialGroups([
    {
      eventType: "created",
      payload: {
        sharedSerials: [
          {
            productId: 9,
            productName: "Gabinete",
            serials: [],
            warrantyMonths: null,
            warrantyMode: null,
          },
          {
            productId: 9,
            productName: "Gabinete",
            serials: ["SN-1"],
            warrantyMonths: 12,
            warrantyMode: "months",
          },
        ],
      },
    },
  ]);
  const items = mergeSharedBarcodeSerials(
    [
      {
        productId: 9,
        productName: "Gabinete",
        serials: [{ idProductSerial: 1, serialNumber: "SN-1" }],
      },
      { productId: 9, productName: "Gabinete", serials: [] },
    ],
    groups,
  );
  assert.deepEqual(
    items[0]?.serials?.map((serial) => serial.serialNumber),
    ["SN-1"],
  );
  assert.deepEqual(
    items[1]?.serials?.map((serial) => serial.serialNumber),
    ["SN-1"],
  );
});
