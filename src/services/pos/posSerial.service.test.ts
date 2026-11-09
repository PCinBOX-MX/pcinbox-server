import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import {
  loadSharedBarcodeKeys,
  mergeSharedBarcodeSerials,
  normalizeItemSerials,
  readSharedSerialGroups,
  serialIsSharedBarcode,
  serialMatchesProductCode,
} from "./posSerial.service";

test("la serie que es el UPC coincide aunque tenga espacios o guiones", () => {
  assert.equal(serialMatchesProductCode("7503053078178", "7503053078178"), true);
  assert.equal(
    serialMatchesProductCode("7503-0530-78178", "7503053078178"),
    true,
  );
  assert.equal(serialMatchesProductCode("SN-REAL-1", "7503053078178"), false);
});

test("varias piezas pueden usar el mismo UPC y una serie real no se repite", () => {
  const upc = normalizeItemSerials(
    2,
    true,
    ["7503053078178", "7503 0530 78178"],
    "Monitor",
    ["7503053078178"],
  );
  assert.deepEqual(upc, ["7503053078178", "7503 0530 78178"]);

  assert.throws(
    () =>
      normalizeItemSerials(2, true, ["SN-1", "SN-1"], "Monitor", [
        "7503053078178",
      ]),
    /series repetidas/,
  );
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
