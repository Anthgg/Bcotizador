import test from "node:test";
import assert from "node:assert/strict";
import { CatalogService } from "../src/catalog/catalog.service";
import {
  validateCatalogBody,
  validateProductTechniqueBody,
  validateWorkerTechniqueBody,
} from "../src/catalog/catalog.validation";

function assertFieldIssue(
  action: () => unknown,
  field: string | RegExp,
  expectedText?: string,
) {
  assert.throws(action, (error: any) => {
    const details = error.getResponse?.()?.details;
    return (
      Array.isArray(details) &&
      details.some((issue: any) => {
        const matchesField =
          typeof field === "string"
            ? issue.field === field
            : field.test(issue.field);
        return (
          matchesField &&
          (!expectedText || issue.message.includes(expectedText))
        );
      })
    );
  });
}

test("recipe CRUD writes ingredients through nested Prisma relations and replaces them on update", async () => {
  const calls: any[] = [];
  const recipeDelegate = {
    create: async (args: any) => {
      calls.push(["create", args]);
      return { id: "recipe-1", ...args.data };
    },
    findUnique: async () => ({
      id: "recipe-1",
      outputProductId: "prepared",
      items: [],
    }),
    update: async (args: any) => {
      calls.push(["update", args]);
      return { id: "recipe-1", ...args.data };
    },
  };
  const prisma: any = {
    recipe: recipeDelegate,
    $transaction: async (work: (tx: any) => Promise<any>) =>
      work({ recipe: recipeDelegate }),
  };
  const audit: any = { write: async () => undefined };
  const service = new CatalogService(prisma, audit, {} as any);
  const items = [{ ingredientProductId: "clay", quantity: 500, unit: "g" }];

  await service.create(
    "recipes",
    { outputProductId: "prepared", yieldQuantity: 1000, yieldUnit: "g", items },
    "admin",
  );
  assert.deepEqual(calls[0][1].data.items, { create: items });

  await service.update("recipes", "recipe-1", { items }, "admin");
  assert.deepEqual(calls[1][1].data.items, { deleteMany: {}, create: items });
});

test("category listing ignores unsupported active filter and orders by name", async () => {
  let args: any;
  const delegate = {
    findMany: async (value: any) => {
      args = value;
      return [];
    },
    count: async () => 0,
  };
  const prisma: any = { productCategory: delegate };
  const service = new CatalogService(prisma, {} as any, {} as any);
  await service.list("product-categories", { isActive: "true", q: "Clay" });
  assert.deepEqual(args.where, {
    name: { contains: "Clay", mode: "insensitive" },
  });
  assert.deepEqual(args.orderBy, { name: "asc" });
});

test("recipe listing orders by output product name", async () => {
  let args: any;
  const recipe = {
    id: "recipe-1",
    outputProductId: "prepared-1",
    outputProduct: { name: "Prepared glaze" },
    items: [],
  };
  const delegate = {
    findMany: async (value: any) => {
      args = value;
      return [recipe];
    },
    count: async () => 1,
  };
  const prisma: any = { recipe: delegate };
  const costs = {
    getRecipeCost: async () => ({
      data: { unitCost: null, costStatus: "COST_INCOMPLETE" },
    }),
  };
  const service = new CatalogService(prisma, {} as any, costs as any);
  const result = await service.list("recipes", {});

  assert.deepEqual(args.orderBy, { outputProduct: { name: "asc" } });
  assert.equal(result.data[0].unitCost, null);
  assert.equal(result.data[0].costStatus, "COST_INCOMPLETE");
});

test("product listing includes the complete imported master by default", async () => {
  const products = Array.from({ length: 265 }, (_, index) => ({
    id: `product-${index}`,
    name: `Product ${index}`,
  }));
  let args: any;
  const delegate = {
    findMany: async (value: any) => {
      args = value;
      return products;
    },
    count: async () => products.length,
  };
  const service = new CatalogService(
    { product: delegate } as any,
    {} as any,
    {} as any,
  );
  const result = await service.list("products", {});

  assert.equal(args.take, 500);
  assert.equal(result.data.length, 265);
  assert.equal(result.pagination.total, 265);
});

test("catalog allowlists accept supported create/update payloads and reject unknown or resource-mismatched fields", () => {
  assert.doesNotThrow(() =>
    validateCatalogBody("products", {
      name: "Arcilla",
      productType: "RAW_MATERIAL",
      unit: "g",
      unitCost: "0.001",
      purchaseUnit: "kg",
      internalReference: null,
      categoryId: null,
      canSell: false,
      canBuy: true,
      isActive: true,
    }),
  );
  assertFieldIssue(
    () =>
      validateCatalogBody("products", { name: "Arcilla", costPerGram: 0.001 }),
    "costPerGram",
    "se calcula a partir",
  );
  assert.doesNotThrow(() =>
    validateCatalogBody("workers", { dailyRate: "110", hoursPerDay: 8 }, true),
  );
  assert.doesNotThrow(() =>
    validateCatalogBody("recipes", {
      outputProductId: "prepared-1",
      yieldQuantity: "1000",
      yieldUnit: "g",
      items: [{ ingredientProductId: "clay-1", quantity: "500", unit: "g" }],
    }),
  );

  assertFieldIssue(
    () =>
      validateCatalogBody("workers", {
        name: "Ana",
        productType: "RAW_MATERIAL",
      }),
    "productType",
    "no se puede modificar",
  );
  assertFieldIssue(
    () => validateCatalogBody("products", { name: "Arcilla", id: "caller-id" }),
    "id",
    "no se puede modificar",
  );
  assertFieldIssue(
    () =>
      validateCatalogBody("products", {
        name: "Arcilla",
        productType: "OTHER",
      }),
    "productType",
  );
  assertFieldIssue(
    () => validateCatalogBody("products", { name: "Arcilla", unitCost: "NaN" }),
    "unitCost",
  );
  assertFieldIssue(
    () => validateCatalogBody("workers", { dailyRate: 110 }),
    "name",
  );
  assertFieldIssue(
    () =>
      validateCatalogBody("workers", { name: "Ana", isActive: "true" }, true),
    "isActive",
  );
  assertFieldIssue(
    () =>
      validateCatalogBody("recipes", {
        outputProductId: "prepared-1",
        yieldQuantity: 1000,
        yieldUnit: "g",
        items: [
          {
            ingredientProductId: "clay-1",
            quantity: 500,
            unit: "g",
            id: "foreign-id",
          },
        ],
      }),
    /^items(?:\.|\[)/,
    "no está permitido",
  );
});

test("relation allowlists accept supported fields and reject unknown or invalid values", () => {
  assert.doesNotThrow(() =>
    validateWorkerTechniqueBody({
      factor1Override: 10,
      cycleRateOverride: "80",
      isActive: true,
    }),
  );
  assert.doesNotThrow(() =>
    validateProductTechniqueBody({
      defaultWorkerId: null,
      order: 2,
      isRequired: false,
    }),
  );
  assertFieldIssue(
    () => validateWorkerTechniqueBody({ workerId: "caller-controlled" }),
    "workerId",
    "no está permitido",
  );
  assertFieldIssue(
    () => validateProductTechniqueBody({ order: 1.5 }),
    "order",
    "número entero",
  );
});
