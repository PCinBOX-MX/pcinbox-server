import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  commitTemporaryQuote,
  ensureQuoteStorage,
  getQuoteTempDirectory,
  resolveQuotePath,
  validatePdfAndHash,
} from "./quoteStorage.service";

let root = "";

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "pcinbox-quotes-"));
  process.env.COTIZACIONES_STORAGE_DIR = root;
  process.env.COTIZACIONES_ENV = "test";
  await ensureQuoteStorage();
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("valida firma, calcula hash y mueve el PDF de forma atómica", async () => {
  const temporaryPath = path.join(getQuoteTempDirectory(), "valid.upload");
  await writeFile(temporaryPath, Buffer.from("%PDF-1.7\nquote"));

  const hash = await validatePdfAndHash(temporaryPath);
  assert.match(hash, /^[a-f0-9]{64}$/);

  const stored = await commitTemporaryQuote(temporaryPath);
  assert.equal(stored.finalPath, resolveQuotePath(stored.storageKey));
});

test("rechaza contenido que solo declara MIME PDF", async () => {
  const temporaryPath = path.join(getQuoteTempDirectory(), "invalid.upload");
  await writeFile(temporaryPath, Buffer.from("not-a-pdf"));
  await assert.rejects(validatePdfAndHash(temporaryPath), /firma PDF válida/);
});

test("rechaza claves que podrían escapar del almacenamiento", () => {
  assert.throws(() => resolveQuotePath("../../etc/passwd"), /Clave/);
});
