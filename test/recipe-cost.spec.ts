import test from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import { RecipeCostService } from "../src/recipes/recipe-cost.service";

const output = {
  id: "prepared",
  name: "Pasta preparada",
  unit: "g",
  productType: "PREPARED_MATERIAL",
};
const clay = {
  id: "clay",
  name: "Arcilla",
  productType: "RAW_MATERIAL",
  unit: "g",
  costUnit: "g",
  costPerGram: new Decimal("0.001"),
  unitCost: null,
};
const recipe = {
  id: "recipe-1",
  outputProductId: "prepared",
  outputProduct: output,
  yieldQuantity: new Decimal(1000),
  yieldUnit: "g",
  items: [
    {
      ingredientProductId: "clay",
      ingredientProduct: clay,
      quantity: new Decimal(500),
      unit: "g",
    },
  ],
};

test("prepared-material cost derives from its recipe and converts yield units", async () => {
  const prisma: any = {
    product: { findUnique: async () => output },
    recipe: {
      findUnique: async ({ where }: any) =>
        where.id === "recipe-1" || where.outputProductId === "prepared"
          ? recipe
          : null,
    },
  };
  const service = new RecipeCostService(prisma);
  assert.equal(
    (await service.costPerUnit("prepared", "g"))?.toFixed(6),
    "0.000500",
  );
  assert.equal(
    (await service.costPerUnit("prepared", "kg"))?.toFixed(6),
    "0.500000",
  );
});

test("recipe reports COST_INCOMPLETE when a required ingredient has no cost", async () => {
  const noCost = { ...clay, costPerGram: null, unitCost: null };
  const incompleteRecipe = {
    ...recipe,
    items: [{ ...recipe.items[0], ingredientProduct: noCost }],
  };
  const prisma: any = {
    recipe: { findUnique: async () => incompleteRecipe },
    product: { findUnique: async () => output },
  };
  const result = await new RecipeCostService(prisma).getRecipeCost("recipe-1");
  assert.equal(result.data.costStatus, "COST_INCOMPLETE");
  assert.equal(result.data.totalCost, null);
  assert.equal(result.data.unitCost, null);
  assert.equal(result.data.items[0].reason, "COST_INCOMPLETE");
});
