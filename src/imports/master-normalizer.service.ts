import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { SequenceKey, SequenceService } from "../common/sequence.service";
import { normalizeUnit } from "../common/units";

/**
 * Runs after a master import is confirmed: rows created by the importer receive their
 * system code and canonical units, the same as rows created from the UI.
 */
@Injectable()
export class MasterNormalizerService {
  constructor(
    private prisma: PrismaService,
    private sequences: SequenceService,
  ) {}

  async normalize() {
    return this.prisma.$transaction(
      async (tx) => {
        const counts = { codes: 0, units: 0 };
        const assign = async (
          key: SequenceKey,
          rows: Array<{ id: string }>,
          update: (id: string, code: string) => Promise<unknown>,
        ) => {
          for (const row of rows) {
            await update(row.id, await this.sequences.next(key, tx));
            counts.codes++;
          }
        };
        await assign(
          "PRODUCT",
          await tx.product.findMany({
            where: { code: null },
            orderBy: [{ createdAt: "asc" }, { internalReference: "asc" }],
            select: { id: true },
          }),
          (id, code) => tx.product.update({ where: { id }, data: { code } }),
        );
        await assign(
          "CUSTOMER",
          await tx.customer.findMany({
            where: { code: null },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          }),
          (id, code) => tx.customer.update({ where: { id }, data: { code } }),
        );
        await assign(
          "MOVEMENT",
          await tx.inventoryMovement.findMany({
            where: { code: null },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          }),
          (id, code) =>
            tx.inventoryMovement.update({ where: { id }, data: { code } }),
        );

        const canonical = (value: string | null) =>
          value == null ? null : (normalizeUnit(value) ?? value);
        for (const product of await tx.product.findMany({
          select: {
            id: true,
            unit: true,
            costUnit: true,
            purchaseUnit: true,
            productType: true,
            isStockable: true,
          },
        })) {
          const data: Record<string, unknown> = {};
          if (canonical(product.unit) !== product.unit)
            data.unit = canonical(product.unit);
          if (canonical(product.costUnit) !== product.costUnit)
            data.costUnit = canonical(product.costUnit);
          if (canonical(product.purchaseUnit) !== product.purchaseUnit)
            data.purchaseUnit = canonical(product.purchaseUnit);
          if (product.productType === "SERVICE" && product.isStockable)
            data.isStockable = false;
          if (Object.keys(data).length) {
            await tx.product.update({ where: { id: product.id }, data });
            counts.units++;
          }
        }
        for (const recipe of await tx.recipe.findMany({
          select: { id: true, yieldUnit: true },
        })) {
          if (canonical(recipe.yieldUnit) !== recipe.yieldUnit) {
            await tx.recipe.update({
              where: { id: recipe.id },
              data: { yieldUnit: canonical(recipe.yieldUnit)! },
            });
            counts.units++;
          }
        }
        for (const item of await tx.recipeItem.findMany({
          select: { id: true, unit: true },
        })) {
          if (canonical(item.unit) !== item.unit) {
            await tx.recipeItem.update({
              where: { id: item.id },
              data: { unit: canonical(item.unit)! },
            });
            counts.units++;
          }
        }
        for (const movement of await tx.inventoryMovement.findMany({
          select: { id: true, unit: true },
        })) {
          if (canonical(movement.unit) !== movement.unit) {
            await tx.inventoryMovement.update({
              where: { id: movement.id },
              data: { unit: canonical(movement.unit)! },
            });
            counts.units++;
          }
        }
        return counts;
      },
      { timeout: 60_000 },
    );
  }
}
