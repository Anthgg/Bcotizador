import test from "node:test";
import assert from "node:assert/strict";
import {
  areUnitsCompatible,
  convertQuantity,
  normalizeUnit,
} from "../src/common/units";
import {
  documentYear,
  formatSequenceCode,
  SequenceService,
} from "../src/common/sequence.service";
import { deriveProductCost } from "../src/catalog/catalog.service";
import {
  validateCatalogBody,
  validateTechniqueRule,
} from "../src/catalog/catalog.validation";
import {
  diffAudit,
  formatAuditValue,
} from "../src/settings/audit-history.service";
import { SettingsService } from "../src/settings/settings.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { mapPrismaError } from "../src/common/errors";
import { resolveUbigeo } from "../src/catalogs/catalogs";
import { fillDocumentText } from "../src/documents/quotation-pdf.renderer";

const fieldIssues = (fn: () => unknown) => {
  try {
    fn();
  } catch (error: any) {
    return (error.getResponse?.().details ?? []) as Array<{
      field: string;
      message: string;
    }>;
  }
  assert.fail("expected a validation error");
};

test("unit aliases collapse to one canonical code and convert only within a dimension", () => {
  for (const alias of ["g", "gr", "G", "gramo", "gramos", "gram"])
    assert.equal(normalizeUnit(alias), "g");
  assert.equal(normalizeUnit("Unidad"), "und");
  assert.equal(normalizeUnit("litros"), "L");
  assert.equal(normalizeUnit("día"), "dia");
  assert.equal(normalizeUnit("paquete"), null);
  assert.equal(convertQuantity(2, "kg", "g")?.toString(), "2000");
  assert.equal(convertQuantity(500, "ml", "L")?.toString(), "0.5");
  assert.equal(convertQuantity(1, "kg", "und"), null);
  assert.equal(areUnitsCompatible("g", "kg"), true);
  assert.equal(areUnitsCompatible("cm3", "ml"), true);
  assert.equal(areUnitsCompatible("cm", "cm2"), false);
});

test("sequence codes are padded, yearly for quotations and never truncated", async () => {
  assert.equal(
    formatSequenceCode({ prefix: "PRD", padding: 6, yearly: false, value: 1 }),
    "PRD-000001",
  );
  assert.equal(
    formatSequenceCode({
      prefix: "CTZ",
      padding: 6,
      yearly: true,
      year: 2026,
      value: 123,
    }),
    "CTZ-2026-000123",
  );
  assert.equal(
    formatSequenceCode({
      prefix: "MOV",
      padding: 4,
      yearly: false,
      value: 1234567,
    }),
    "MOV-1234567",
  );
  const year = documentYear();
  const service = new SequenceService({} as any);
  assert.equal(
    service.preview({
      prefix: "CTZ",
      padding: 6,
      yearly: true,
      currentYear: year - 1,
      lastValue: 87,
    }),
    `CTZ-${year}-000001`,
  );
  assert.equal(
    service.preview({
      prefix: "TRB",
      padding: 6,
      yearly: false,
      currentYear: null,
      lastValue: 4,
    }),
    "TRB-000005",
  );

  const db: any = {
    $queryRaw: async () => [
      {
        prefix: "PRD",
        padding: 6,
        yearly: false,
        currentYear: null,
        lastValue: 266,
      },
    ],
  };
  assert.equal(await service.next("PRODUCT", db), "PRD-000266");
});

test("product cost per gram is derived from cost and unit, never typed", () => {
  assert.deepEqual(deriveProductCost("g", "0.02"), {
    costUnit: "g",
    costPerGram: "0.02",
  });
  assert.deepEqual(deriveProductCost("kg", "12"), {
    costUnit: "kg",
    costPerGram: "0.012",
  });
  assert.deepEqual(deriveProductCost("und", "30"), {
    costUnit: "und",
    costPerGram: null,
  });
  assert.deepEqual(deriveProductCost("g", null), {
    costUnit: "g",
    costPerGram: null,
  });
});

test("catalog validation normalizes units, rejects manual codes and explains each field in Spanish", () => {
  const normalized = validateCatalogBody("products", {
    name: "Pasta blanca",
    unit: "gr",
    purchaseUnit: "Kilos",
  });
  assert.equal(normalized.unit, "g");
  assert.equal(normalized.purchaseUnit, "kg");
  assert.deepEqual(
    fieldIssues(() =>
      validateCatalogBody("workers", { name: "Ana", code: "TRB001" }),
    ),
    [{ field: "code", message: "El código se genera automáticamente." }],
  );
  assert.match(
    fieldIssues(() =>
      validateCatalogBody("products", { name: "X", unit: "paquete" }),
    )[0].message,
    /Selecciona una unidad/,
  );
  assert.match(
    fieldIssues(() =>
      validateCatalogBody("products", {
        name: "X",
        unit: "g",
        purchaseUnit: "und",
      }),
    )[0].message,
    /compatible/,
  );
  assert.match(
    fieldIssues(() =>
      validateCatalogBody("products", { name: "X", unit: "g", salePrice: -1 }),
    )[0].message,
    /mayor o igual a cero/,
  );
  assert.match(
    fieldIssues(() =>
      validateCatalogBody("customers", {
        displayName: "Ana",
        contact: { identificationType: "DNI", identificationNumber: "123" },
      }),
    )[0].message,
    /8 dígitos/,
  );
  assert.match(
    fieldIssues(() =>
      validateCatalogBody("customers", {
        displayName: "Ana",
        contact: {
          identificationType: "RUC",
          identificationNumber: "12345678901",
        },
      }),
    )[0].message,
    /RUC/,
  );
  assert.doesNotThrow(() =>
    validateCatalogBody("customers", {
      displayName: "Ana",
      customerType: "STUDENT",
      contact: {
        identificationType: "DNI",
        identificationNumber: "40903769",
        email: "ana@correo.pe",
      },
    }),
  );
  assert.match(
    fieldIssues(() =>
      validateTechniqueRule({
        rule: "DOS_FACTORES",
        factor1: 50,
        factor2: null,
      }),
    )[0].message,
    /segundo rendimiento/,
  );
  assert.doesNotThrow(() =>
    validateTechniqueRule({ rule: "SIMPLE", factor1: null }),
  );
});

test("settings validate company RUC, district and derive the location from the INEI code", async () => {
  const writes: any[] = [];
  const prisma: any = {
    companyProfile: {
      findUnique: async () => null,
      upsert: async (args: any) => {
        writes.push(args.update);
        return args.create;
      },
    },
    companyLogo: { findUnique: async () => null },
    $transaction: async (work: any) => work(prisma),
  };
  const service = new SettingsService(
    prisma,
    { write: async () => undefined } as any,
    { get: () => undefined } as any,
    new SequenceService(prisma),
  );
  await assert.rejects(
    service.updateCompany({ ruc: "123" }, "admin"),
    (error: any) => error.getResponse().details[0].field === "ruc",
  );
  await assert.rejects(
    service.updateCompany({ ubigeoCode: "999999" }, "admin"),
    (error: any) => error.getResponse().details[0].field === "ubigeoCode",
  );
  await service.updateCompany(
    { ruc: "20601234567", ubigeoCode: "150104", website: "greda.pe" },
    "admin",
  );
  assert.equal(writes[0].district, "Barranco");
  assert.equal(writes[0].province, "Lima");
  assert.equal(writes[0].country, "Perú");
  assert.equal(writes[0].website, "https://greda.pe");
  assert.equal(resolveUbigeo("150104")?.department, "Lima");
});

test("commercial settings keep the recommended factor at or above the minimum", async () => {
  const prisma: any = { commercialSettings: { findUnique: async () => null } };
  const service = new SettingsService(
    prisma,
    {} as any,
    { get: () => undefined } as any,
    new SequenceService(prisma),
  );
  await assert.rejects(
    service.update({ productionFactorDefault: "1.5" }, "admin"),
    (error: any) =>
      error.getResponse().details[0].field === "productionFactorDefault",
  );
  await assert.rejects(service.update({ igvRate: 18 }, "admin"), (error: any) =>
    /no puede ser mayor/.test(error.getResponse().details[0].message),
  );
  await assert.rejects(service.update({ priceRounding: "UP_3" }, "admin"));
});

test("audit history shows readable field changes instead of raw JSON", () => {
  const changes = diffAudit(
    {
      igvRate: "0.16",
      tradeName: "Greda",
      updatedAt: "2026-01-01",
      isActive: true,
    },
    {
      igvRate: "0.18",
      tradeName: "Greda Cerámica",
      updatedAt: "2026-01-02",
      isActive: false,
    },
  );
  assert.deepEqual(
    changes.map((change) => [change.label, change.before, change.after]),
    [
      ["IGV", "16%", "18%"],
      ["Nombre comercial", "Greda", "Greda Cerámica"],
      ["Activo", "Sí", "No"],
    ],
  );
  assert.equal(formatAuditValue("priceRounding", "UP_10"), "A S/ 10 superior");
  assert.equal(
    formatAuditValue("rule", "DOS_FACTORES"),
    "Dos tramos de rendimiento",
  );
});

test("inventory movements convert to the product unit and get a movement code", async () => {
  let created: any;
  const tx: any = {
    product: {
      findUnique: async () => ({ id: "clay", unit: "g", isStockable: true }),
    },
    location: { upsert: async () => ({ id: "main", name: "Principal" }) },
    inventoryMovement: {
      aggregate: async () => ({ _sum: { quantity: "500" } }),
      create: async ({ data }: any) => {
        created = data;
        return { id: "m1", ...data };
      },
    },
  };
  const prisma: any = { $transaction: async (work: any) => work(tx) };
  const sequences: any = { next: async () => "MOV-000003" };
  const service = new InventoryService(
    prisma,
    { write: async () => undefined } as any,
    sequences,
  );
  const result = await service.createMovement(
    { productId: "clay", type: "ENTRY", quantity: "2", unit: "kg" } as any,
    "user",
  );
  assert.equal(created.code, "MOV-000003");
  assert.equal(created.unit, "g");
  assert.equal(Number(created.quantity), 2000);
  assert.equal(Number(result.balance), 2500);
  await assert.rejects(
    service.createMovement(
      { productId: "clay", type: "EXIT", quantity: "3", unit: "kg" } as any,
      "user",
    ),
    /supera el saldo/,
  );
  await assert.rejects(
    service.createMovement(
      { productId: "clay", type: "ENTRY", quantity: "3", unit: "und" } as any,
      "user",
    ),
    (error: any) => error.getResponse().details[0].field === "unit",
  );
});

test("Prisma constraint errors become human 409 responses", () => {
  assert.equal(
    mapPrismaError({ code: "P2002", meta: { target: ["email"] } })?.message,
    "Ese correo ya está registrado.",
  );
  assert.equal(mapPrismaError({ code: "P2003", meta: {} })?.status, 409);
  assert.equal(mapPrismaError({ code: "P2025", meta: {} })?.status, 404);
  assert.equal(mapPrismaError(new Error("boom")), null);
});

test("document texts fill validity placeholders", () => {
  assert.match(
    fillDocumentText("Válida por {dias} días, hasta el {vence}.", {
      validityDays: 15,
      validUntil: "2026-10-16T17:00:00.000Z",
    }) ?? "",
    /^Válida por 15 días, hasta el 16 de octubre de 2026\.$/,
  );
});
