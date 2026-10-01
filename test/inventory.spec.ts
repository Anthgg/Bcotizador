import test from "node:test";
import assert from "node:assert/strict";
import { InventoryService } from "../src/inventory/inventory.service";

test("inventory lists every imported product and its opening balance by default", async () => {
  const products = Array.from({ length: 265 }, (_, index) => ({
    id: `product-${index}`,
    name: `Product ${index}`,
    internalReference: null,
    categoryId: "category-1",
    category: { name: "Imported category" },
    unit: "g",
  }));
  const prisma: any = {
    product: {
      findMany: async () => products,
      count: async () => products.length,
    },
    inventoryMovement: {
      groupBy: async () => [
        { productId: "product-0", _sum: { quantity: "1000" } },
        { productId: "product-1", _sum: { quantity: "800" } },
      ],
    },
  };
  const service = new InventoryService(prisma, {} as any);
  const result = await service.list({});

  assert.equal(result.data.length, 265);
  assert.equal(result.pagination.total, 265);
  assert.equal(result.pagination.pageSize, 500);
  assert.deepEqual(
    result.data.slice(0, 2).map((row) => row.quantity),
    ["1000", "800"],
  );
});
