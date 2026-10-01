import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { ImportsService } from "../src/imports/imports.service";
import { ImportStatus, ProductType } from "../src/generated/prisma/enums";

const workbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  const sheets: Record<string, unknown[][]> = {
    "Categoria de producto": [
      ["Categoria", "Categoria padre", "Nombre a mostrar"],
      ["Insumos Taller", null, "Insumos Taller"],
      ["Pastas", "Insumos Taller", "Insumos Taller / Pastas"],
      ["Productos terminados Taller", null, "Productos terminados Taller"],
      [
        "Esmaltes",
        "Productos terminados Taller",
        "Productos terminados Taller / Esmaltes",
      ],
      [
        "Bases y neutros",
        "Esmaltes",
        "Productos terminados Taller / Esmaltes / Bases y neutros",
      ],
      [
        "Artesanias Greda",
        "Productos terminados Taller",
        "Productos terminados Taller / Artesanias Greda",
      ],
      ["Servicios", null, "Servicios"],
      ["Clases", "Servicios", "Servicios / Clases"],
      ["Adultos", "Clases", "Servicios / Clases / Adultos"],
    ],
    "Categoria en Punto de venta": [["Nombre"], ["Cerámica"]],
    "Proveedores y clientes": [["Nombre"], ["Contacto ejemplo"]],
    Productos: [
      [
        "Nombre",
        "Referencia interna",
        "Costo",
        "Unidad de medida",
        "Categoria de producto",
      ],
      [
        "Pasta preparada",
        "P-1",
        5,
        "kg",
        "Productos terminados Taller / Esmaltes / Bases y neutros",
      ],
      ["Arcilla", "A-1", 2, "kg", "Insumos Taller / Pastas"],
      ["Agua", "W-1", 0, "l", "Insumos Taller / Pastas"],
      [
        "Masa especial",
        "M-1",
        3,
        "kg",
        "Productos terminados Taller / Esmaltes / Bases y neutros",
      ],
      [
        "Taza",
        "T-1",
        null,
        "unit",
        "Productos terminados Taller / Artesanias Greda",
      ],
      ["Clase adultos", "C-1", 25, "unit", "Servicios / Clases / Adultos"],
    ],
    Recetas: [
      [
        "Nombre del producto a preparar",
        "Cantidad",
        "Unidad de medida del producto preparado",
        "Insumo",
        "Cantidad del insumo",
        "Unidad de medida del insumo",
      ],
      ["Pasta preparada", 1000, "g", "Arcilla", 800, "g"],
      ["268", null, "268", "Agua", 200, "ml"],
      ["Masa especial", null, "kg", "Arcilla", 50, "g"],
      ["268", null, "268", "Agua", 20, "ml"],
      ["Taza", 4, "unit", "Pasta preparada", 500, "g"],
    ],
    Stock: [
      ["Producto", "Cantidad"],
      ["Taza", 3],
    ],
  };
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

test("recipe parser groups continuation rows when yield is blank despite 268 sentinels", () => {
  const service = new ImportsService({} as never, {} as never);
  const parsed = (service as any).parse(workbookBuffer());
  assert.equal(parsed.rowsBySheet.recipeGroups.length, 2);
  const first = parsed.rowsBySheet.recipeGroups[0];
  assert.equal(first.outputName, "Pasta preparada");
  assert.equal(first.items.length, 2);
  assert.deepEqual(
    first.items.map((item: any) => item.ingredientName),
    ["Arcilla", "Agua"],
  );
  assert.equal(parsed.rowsBySheet.recipeGroups[1].outputName, "Taza");
  assert.equal(parsed.rowsBySheet.recipeGroups[1].items.length, 1);
  assert.deepEqual(
    parsed.warnings.map((warning: any) => warning.code),
    ["SOURCE_CONFLICT"],
  );
  assert.equal(parsed.warnings[0].rowNumber, 4);
});

test("preview keeps source conflicts as warnings without blocking valid rows", async () => {
  const service = new ImportsService(
    {
      product: { findMany: async () => [] },
      contact: { findMany: async () => [] },
      productCategory: { findMany: async () => [] },
      posCategory: { findMany: async () => [] },
      recipe: { findMany: async () => [] },
    } as never,
    {} as never,
  );
  const analysis = await (service as any).previewCounts({
    rowsBySheet: {
      products: [],
      contacts: [],
      categories: [],
      posCategories: [],
      recipeGroups: [],
      stock: [],
    },
    errors: [],
    warnings: [
      {
        sheet: "Recetas",
        rowNumber: 420,
        severity: "WARNING",
        code: "SOURCE_CONFLICT",
        message: "Receta incompleta omitida",
      },
    ],
  });

  assert.equal(analysis.errors.length, 0);
  assert.deepEqual(
    analysis.warnings.map((warning: any) => warning.code),
    ["SOURCE_CONFLICT"],
  );
});

test("preview resolves full Excel category paths and classifies source product types", async () => {
  const service = new ImportsService(
    {
      product: { findMany: async () => [] },
      contact: { findMany: async () => [] },
      productCategory: { findMany: async () => [] },
      posCategory: { findMany: async () => [] },
      recipe: { findMany: async () => [] },
    } as never,
    {} as never,
  );
  const parsed = (service as any).parse(workbookBuffer());
  const analysis = await (service as any).previewCounts(parsed);

  assert.deepEqual(
    analysis.errors.map((issue: any) => issue.code),
    [],
  );
  assert.equal(analysis.count.categories.total, 9);
  assert.equal(
    analysis.warnings.some(
      (warning: any) => warning.code === "PRODUCT_TYPE_DEFAULTED",
    ),
    false,
  );
});

test("confirm marks only imported recipe outputs as prepared and audits the product type change", async () => {
  const products = new Map<string, any>([
    [
      "prepared",
      {
        id: "prepared",
        name: "Pasta preparada",
        productType: ProductType.FINISHED_PRODUCT,
      },
    ],
    [
      "clay",
      { id: "clay", name: "Arcilla", productType: ProductType.RAW_MATERIAL },
    ],
    [
      "finished",
      {
        id: "finished",
        name: "Taza",
        productType: ProductType.FINISHED_PRODUCT,
      },
    ],
  ]);
  const batch = {
    id: "batch-1",
    sha256: "sha256-fixture",
    fileName: "fixture.xlsx",
    status: ImportStatus.PREVIEW,
    preview: { counts: {}, errors: [], warnings: [], ambiguities: [] },
    rawData: {
      products: [],
      contacts: [],
      categories: [],
      posCategories: [],
      stock: [],
      recipeGroups: [
        {
          outputName: "Pasta preparada",
          yieldQuantity: 1000,
          yieldUnit: "g",
          rowNumber: 2,
          items: [
            {
              ingredientName: "Arcilla",
              quantity: 800,
              unit: "g",
              rowNumber: 2,
            },
          ],
        },
      ],
    },
  };
  const auditEvents: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    importBatch: {
      findUnique: async () => batch,
      update: async ({ data }: any) => ({ ...batch, ...data }),
    },
    product: {
      findMany: async () =>
        [...products.values()].map(({ id, name, productType }) => ({
          id,
          name,
          productType,
        })),
      findUnique: async ({ where }: any) =>
        structuredClone(products.get(where.id) ?? null),
      update: async ({ where, data }: any) => {
        const updated = { ...products.get(where.id), ...data };
        products.set(where.id, updated);
        return structuredClone(updated);
      },
    },
    recipe: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({ id: "recipe-1", ...create }),
    },
  };
  const prisma: any = {
    $transaction: async (work: (client: any) => Promise<any>) => work(tx),
  };
  const audit: any = {
    write: async (...args: any[]) => {
      auditEvents.push(args);
    },
  };

  await new ImportsService(prisma, audit).confirm("batch-1", "admin-1");

  assert.equal(
    products.get("prepared").productType,
    ProductType.PREPARED_MATERIAL,
  );
  assert.equal(products.get("clay").productType, ProductType.RAW_MATERIAL);
  assert.equal(
    products.get("finished").productType,
    ProductType.FINISHED_PRODUCT,
  );
  const productTypeAudit = auditEvents.find(
    ([actorId, action, entity]) =>
      actorId === "admin-1" && action === "UPDATE" && entity === "Product",
  );
  assert.ok(productTypeAudit);
  assert.equal(productTypeAudit[4].productType, ProductType.FINISHED_PRODUCT);
  assert.equal(productTypeAudit[5].productType, ProductType.PREPARED_MATERIAL);
});

test("confirm keeps category paths unique and infers raw, prepared, finished, and service types", async () => {
  const batch: any = {
    id: "batch-categories",
    sha256: "sha256-categories",
    fileName: "categories.xlsx",
    status: ImportStatus.PREVIEW,
    preview: { counts: {}, errors: [], warnings: [], ambiguities: [] },
    rawData: {
      contacts: [],
      posCategories: [],
      recipeGroups: [],
      stock: [],
      categories: [
        {
          Categoria: "Insumos Taller",
          "Nombre a mostrar": "Insumos Taller",
          __row: 2,
        },
        {
          Categoria: "Pastas",
          "Categoria padre": "Insumos Taller",
          "Nombre a mostrar": "Insumos Taller / Pastas",
          __row: 3,
        },
        {
          Categoria: "Productos terminados Taller",
          "Nombre a mostrar": "Productos terminados Taller",
          __row: 4,
        },
        {
          Categoria: "Esmaltes",
          "Categoria padre": "Productos terminados Taller",
          "Nombre a mostrar": "Productos terminados Taller / Esmaltes",
          __row: 5,
        },
        {
          Categoria: "Bases y neutros",
          "Categoria padre": "Esmaltes",
          "Nombre a mostrar":
            "Productos terminados Taller / Esmaltes / Bases y neutros",
          __row: 6,
        },
        {
          Categoria: "Artesanias Greda",
          "Categoria padre": "Productos terminados Taller",
          "Nombre a mostrar": "Productos terminados Taller / Artesanias Greda",
          __row: 7,
        },
        { Categoria: "Servicios", "Nombre a mostrar": "Servicios", __row: 8 },
        {
          Categoria: "Clases",
          "Categoria padre": "Servicios",
          "Nombre a mostrar": "Servicios / Clases",
          __row: 9,
        },
        {
          Categoria: "Adultos",
          "Categoria padre": "Clases",
          "Nombre a mostrar": "Servicios / Clases / Adultos",
          __row: 10,
        },
      ],
      products: [
        {
          Nombre: "Arcilla",
          "Referencia interna": "A-1",
          "Categoria de producto": "Insumos Taller / Pastas",
          "Unidad de medida": "gr",
          "Unidad de medida de compra": "kg",
          Costo: 0.001062,
          __row: 2,
        },
        {
          Nombre: "Barniz",
          "Referencia interna": "B-1",
          "Categoria de producto":
            "Productos terminados Taller / Esmaltes / Bases y neutros",
          "Unidad de medida": "gr",
          Costo: 0.01,
          __row: 3,
        },
        {
          Nombre: "Jarra",
          "Referencia interna": "J-1",
          "Categoria de producto":
            "Productos terminados Taller / Artesanias Greda",
          "Unidad de medida": "unit",
          __row: 4,
        },
        {
          Nombre: "Clase adultos",
          "Referencia interna": "C-1",
          "Categoria de producto": "Servicios / Clases / Adultos",
          "Unidad de medida": "unit",
          SalePrice: 25,
          __row: 5,
        },
      ],
    },
  };
  const categories = new Map<string, any>();
  const products = new Map<string, any>();
  let categoryId = 0,
    productId = 0;
  const tx: any = {
    $queryRaw: async () => [],
    importBatch: {
      findUnique: async () => batch,
      update: async ({ data }: any) => ({ ...batch, ...data }),
    },
    productCategory: {
      findUnique: async ({ where }: any) =>
        structuredClone(
          categories.get(where.name) ??
            [...categories.values()].find((row) => row.id === where.id) ??
            null,
        ),
      upsert: async ({ where, create, update }: any) => {
        const after = categories.has(where.name)
          ? { ...categories.get(where.name), ...update }
          : { id: "category-" + ++categoryId, ...create };
        categories.set(where.name, after);
        return structuredClone(after);
      },
    },
    product: {
      findUnique: async ({ where }: any) =>
        structuredClone(
          where.id
            ? (products.get(where.id) ?? null)
            : ([...products.values()].find(
                (row) => row.internalReference === where.internalReference,
              ) ?? null),
        ),
      create: async ({ data }: any) => {
        const row = { id: "product-" + ++productId, ...data };
        products.set(row.id, row);
        return structuredClone(row);
      },
      findMany: async () =>
        [...products.values()].map(({ id, name, productType }) => ({
          id,
          name,
          productType,
        })),
    },
    recipe: { findUnique: async () => null, upsert: async () => null },
  };
  const audit: any = { write: async () => undefined };

  await new ImportsService(
    {
      $transaction: async (work: (client: any) => Promise<any>) => work(tx),
    } as never,
    audit,
  ).confirm(batch.id, "admin-1");

  const byName = new Map([...products.values()].map((row) => [row.name, row]));
  assert.equal(byName.get("Arcilla").productType, ProductType.RAW_MATERIAL);
  assert.equal(byName.get("Arcilla").unit, "gr");
  assert.equal(byName.get("Arcilla").purchaseUnit, "kg");
  assert.equal(byName.get("Arcilla").costUnit, "gr");
  assert.equal(byName.get("Arcilla").costPerGram, "0.001062");
  assert.equal(byName.get("Barniz").productType, ProductType.PREPARED_MATERIAL);
  assert.equal(byName.get("Barniz").costPerGram, "0.01");
  assert.equal(byName.get("Jarra").productType, ProductType.FINISHED_PRODUCT);
  assert.equal(byName.get("Clase adultos").productType, ProductType.SERVICE);
  assert.ok(byName.get("Arcilla").categoryId);
  const enamel = categories.get("Productos terminados Taller / Esmaltes");
  assert.equal(
    categories.get("Productos terminados Taller / Esmaltes / Bases y neutros")
      .parentId,
    enamel.id,
  );
});
