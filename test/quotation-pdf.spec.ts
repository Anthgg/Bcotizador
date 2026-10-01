import assert from "node:assert/strict";
import { test } from "node:test";
import { QuotationPdfService } from "../src/quotations/quotation-pdf.service";
import { DOCUMENT_DEFAULTS } from "../src/settings/settings.service";
import {
  renderQuotationPdf,
  sampleQuote,
} from "../src/documents/quotation-pdf.renderer";

const company = {
  tradeName: "Greda Cerámica",
  legalName: "TALLER GREDA S.A.C.",
  ruc: "20601234567",
  address: "Av. Pedro de Osma 135",
  district: "Barranco",
  province: "Lima",
  department: "Lima",
  phone: "01 247 8890",
  email: "contacto@greda.pe",
  website: "https://greda.pe",
};
const settings = {
  company: async () => ({ data: company }),
  documents: async () => ({
    data: {
      ...DOCUMENT_DEFAULTS,
      showSignature: true,
      signatureName: "Anthony G.",
    },
  }),
  logo: async () => null,
};
const pdfText = (pdf: Buffer) => pdf.toString("latin1");
const pageCount = (pdf: Buffer) =>
  (pdfText(pdf).match(/\/Type \/Page\b/g) ?? []).length;

test("quotation PDF service renders a complete PDF for a public quotation with company settings", async () => {
  const quotation = {
    code: "CTZ-2026-000001",
    status: "CONFIRMED",
    issuedAt: "2026-10-01T12:00:00.000Z",
    validUntil: "2026-10-31T12:00:00.000Z",
    validityDays: 30,
    customer: {
      name: "Cliente QA GREDA",
      documentType: "RUC",
      documentNumber: "20101194991",
      email: "qa@cliente.pe",
      phone: "987654321",
    },
    items: [
      {
        name: "PLATOS HONDOS CHICOS",
        detail: "22 × 22 × 5 cm",
        quantity: 18,
        unit: "und",
        unitPrice: 223.09,
        lineTotal: 4015.68,
      },
    ],
    totals: {
      subtotal: 3403.12,
      igvRate: 0.18,
      igvAmount: 612.56,
      total: 4015.68,
    },
  };
  const source = {
    publicDocument: async (id: string) =>
      id === "qa-quotation" ? quotation : null,
  };

  const { buffer, code } = await new QuotationPdfService(
    source as never,
    settings as never,
  ).create("qa-quotation");

  assert.equal(code, "CTZ-2026-000001");
  assert.ok(buffer.length > 500);
  assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(buffer.subarray(-32).toString("ascii").includes("%%EOF"));
  assert.equal(pageCount(buffer), 1);
});

test("long quotations continue on a second page and never expose internal cost fields", async () => {
  const pdf = await renderQuotationPdf({
    company,
    documents: { ...DOCUMENT_DEFAULTS },
    quote: sampleQuote(30, 24),
  });
  assert.equal(pageCount(pdf), 2);
  const raw = pdfText(pdf);
  for (const hidden of [
    "materialCost",
    "laborCost",
    "firingCost",
    "productionFactor",
    "Costo técnico",
    "margen",
  ])
    assert.equal(raw.includes(hidden), false, hidden);
});
