import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseClientFromPdfKeywords,
  parseQuotePdfClientFromText,
  resolvePosCustomerFromPdf,
} from "./quotePdfClient.service";

describe("parseQuotePdfClientFromText", () => {
  it("lee nombre + teléfono del bloque Cliente", () => {
    const parsed = parseQuotePdfClientFromText([
      "Cotización",
      "Cliente",
      "Juan Pérez",
      "+52 5512345678",
      "No. Cotización",
      "1234567890123",
    ]);
    assert.equal(parsed.name, "Juan Pérez");
    assert.equal(parsed.email, null);
    assert.equal(parsed.phone, "+52 5512345678");
    assert.equal(parsed.isPublicSale, false);
  });

  it("lee nombre + correo (sin teléfono)", () => {
    const parsed = parseQuotePdfClientFromText([
      "Cliente",
      "Ana López",
      "ana@mail.com",
      "No. Cotización",
    ]);
    assert.equal(parsed.name, "Ana López");
    assert.equal(parsed.email, "ana@mail.com");
    assert.equal(parsed.phone, null);
  });

  it("detecta venta público general", () => {
    const parsed = parseQuotePdfClientFromText([
      "Cliente",
      "Venta público general",
      "No. Cotización",
    ]);
    assert.equal(parsed.isPublicSale, true);
    assert.equal(parsed.name, null);
  });
});

describe("parseClientFromPdfKeywords", () => {
  it("lee identity embebida en /Keywords", () => {
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<< /Keywords (pcinbox-client-v1|name=Juan Perez|phone=+52 5512345678) >>endobj\n",
      "latin1",
    );
    const parsed = parseClientFromPdfKeywords(pdf);
    assert.ok(parsed);
    assert.equal(parsed!.name, "Juan Perez");
    assert.equal(parsed!.phone, "+52 5512345678");
    assert.equal(parsed!.email, null);
    assert.equal(parsed!.isPublicSale, false);
  });

  it("no arrastra basura endobj tras el teléfono", () => {
    const pdf = Buffer.from(
      "pcinbox-client-v1|name=Patricio Estrella|phone=+52 2312321321)endobj15 0 obj<</Producer 16 0 R/Creator 17 0 R/Keywords 22 0 R>>endobj13 0 obj<</Type /Font/BaseFont /Helvetica",
      "latin1",
    );
    const parsed = parseClientFromPdfKeywords(pdf);
    assert.ok(parsed);
    assert.equal(parsed!.name, "Patricio Estrella");
    assert.equal(parsed!.phone, "+52 2312321321");
    assert.equal(parsed!.email, null);
  });

  it("lee public=1", () => {
    const pdf = Buffer.from(
      "%PDF-1.4\n<< /Keywords (pcinbox-client-v1|public=1) >>\n",
      "latin1",
    );
    const parsed = parseClientFromPdfKeywords(pdf);
    assert.ok(parsed);
    assert.equal(parsed!.isPublicSale, true);
  });
});

describe("resolvePosCustomerFromPdf", () => {
  it("usa teléfono del PDF cuando existe", () => {
    const customer = resolvePosCustomerFromPdf(
      {
        name: "Juan",
        email: null,
        phone: "+52 5512345678",
        isPublicSale: false,
      },
      "+52 9999999999",
    );
    assert.equal(customer.phone, "+52 5512345678");
    assert.equal(customer.name, "Juan");
  });

  it("con nombre+correo busca teléfono en DB del cliente", () => {
    const customer = resolvePosCustomerFromPdf(
      {
        name: "Ana López",
        email: "ana@mail.com",
        phone: null,
        isPublicSale: false,
      },
      "5511223344",
    );
    assert.equal(customer.name, "Ana López");
    assert.equal(customer.email, "ana@mail.com");
    assert.equal(customer.phone, "5511223344");
  });

  it("con nombre+correo sin teléfono en DB deja phone null", () => {
    const customer = resolvePosCustomerFromPdf(
      {
        name: "Ana López",
        email: "ana@mail.com",
        phone: null,
        isPublicSale: false,
      },
      null,
    );
    assert.equal(customer.phone, null);
  });

  it("solo nombre no fuerza teléfono de cuenta", () => {
    const customer = resolvePosCustomerFromPdf(
      {
        name: "Solo Nombre",
        email: null,
        phone: null,
        isPublicSale: false,
      },
      "5511223344",
    );
    assert.equal(customer.name, "Solo Nombre");
    assert.equal(customer.phone, null);
  });
});
