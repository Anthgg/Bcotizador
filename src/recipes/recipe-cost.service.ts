import { Injectable, NotFoundException } from "@nestjs/common";
import Decimal from "decimal.js";
import { PrismaService } from "../common/prisma.service";
import { dec, roundCommercial } from "../common/money";
import { FieldErrors } from "../common/errors";
import {
  convertQuantity,
  normalizeUnit as canonicalUnit,
} from "../common/units";

const normalizeUnit = (value: string | null | undefined) =>
  canonicalUnit(value) ??
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const format = (value: Decimal | null) =>
  value == null ? null : roundCommercial(value, 12).toFixed(12);

type CostItem = {
  ingredientProductId: string;
  ingredientName: string;
  quantity: string;
  unit: string;
  appliedCostPerUnit: string | null;
  cost: string | null;
  reason?: string;
};
type RecipeCost = {
  costStatus: "READY" | "COST_INCOMPLETE";
  totalCost: string | null;
  knownPartialCost: string | null;
  unitCost: string | null;
  items: CostItem[];
};

@Injectable()
export class RecipeCostService {
  constructor(private readonly prisma: PrismaService) {}

  private convertRate(
    rate: Decimal,
    fromUnit: string,
    toUnit: string,
  ): Decimal | null {
    const from = normalizeUnit(fromUnit),
      to = normalizeUnit(toUnit);
    if (from === to) return rate;
    // A rate per `fromUnit` becomes a rate per `toUnit` by pricing one `toUnit` in `fromUnit`s.
    const oneTarget = convertQuantity(1, to, from);
    return oneTarget == null ? null : rate.mul(oneTarget);
  }

  private async directUnitRate(
    product: any,
    unit: string,
  ): Promise<Decimal | null> {
    if (product.costPerGram != null) {
      const rate = this.convertRate(
        dec(product.costPerGram.toString()),
        "g",
        unit,
      );
      if (rate != null) return rate;
    }
    if (product.unitCost == null) return null;
    const sourceUnit = product.costUnit ?? product.purchaseUnit ?? product.unit;
    return this.convertRate(dec(product.unitCost.toString()), sourceUnit, unit);
  }

  private async recipeForProduct(productId: string) {
    return this.prisma.recipe.findUnique({
      where: { outputProductId: productId },
      include: {
        outputProduct: true,
        items: { include: { ingredientProduct: true } },
      },
    });
  }

  private async rateForProduct(
    product: any,
    targetUnit: string,
    ancestors: Set<string>,
  ): Promise<Decimal | null> {
    if (product.productType !== "PREPARED_MATERIAL")
      return this.directUnitRate(product, targetUnit);
    const recipe = await this.recipeForProduct(product.id);
    if (!recipe || ancestors.has(product.id)) return null;
    const result = await this.calculate(
      recipe,
      new Set([...ancestors, product.id]),
    );
    if (result.costStatus !== "READY" || result.unitCost == null) return null;
    return this.convertRate(dec(result.unitCost), recipe.yieldUnit, targetUnit);
  }

  private async calculate(
    recipe: any,
    ancestors: Set<string>,
  ): Promise<RecipeCost> {
    const yieldQuantity = dec(recipe.yieldQuantity.toString());
    if (yieldQuantity.lte(0)) {
      return {
        costStatus: "COST_INCOMPLETE",
        totalCost: null,
        knownPartialCost: "0.000000000000",
        unitCost: null,
        items: [],
      };
    }
    let total = new Decimal(0);
    let incomplete = recipe.items.length === 0;
    const items: CostItem[] = [];
    for (const item of recipe.items) {
      const quantity = dec(item.quantity.toString());
      const product = item.ingredientProduct;
      const rate = await this.rateForProduct(product, item.unit, ancestors);
      const cost = rate == null ? null : quantity.mul(rate);
      if (cost == null) incomplete = true;
      else total = total.plus(cost);
      items.push({
        ingredientProductId: product.id,
        ingredientName: product.name,
        quantity: format(quantity)!,
        unit: item.unit,
        appliedCostPerUnit: format(rate),
        cost: format(cost),
        ...(rate == null
          ? {
              reason: ancestors.has(product.id)
                ? "RECIPE_CYCLE_OR_COST_INCOMPLETE"
                : "COST_INCOMPLETE",
            }
          : {}),
      });
    }
    const unitCost = incomplete ? null : total.div(yieldQuantity);
    return {
      costStatus: incomplete ? "COST_INCOMPLETE" : "READY",
      totalCost: incomplete ? null : format(total),
      knownPartialCost: incomplete ? format(total) : null,
      unitCost: format(unitCost),
      items,
    };
  }

  async costPerUnit(productId: string, unit: string): Promise<Decimal | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return null;
    return this.rateForProduct(product, unit, new Set());
  }

  /** Prices an unsaved recipe so the editor can show live costs; the backend stays the cost authority. */
  async previewCost(body: unknown) {
    const input = (body && typeof body === "object" ? body : {}) as Record<
      string,
      any
    >;
    const errors = new FieldErrors();
    const yieldQuantity = Number(input.yieldQuantity);
    if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0)
      errors.add("yieldQuantity", "El rendimiento debe ser mayor que cero.");
    const yieldUnit = canonicalUnit(input.yieldUnit);
    if (!yieldUnit)
      errors.add("yieldUnit", "Selecciona la unidad de rendimiento.");
    const rawItems: any[] = Array.isArray(input.items) ? input.items : [];
    const ids = rawItems
      .map((item) => item?.ingredientProductId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids } } })
      : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    const items: any[] = [];
    rawItems.forEach((item, index) => {
      const product = byId.get(item?.ingredientProductId);
      const quantity = Number(item?.quantity);
      const unit = canonicalUnit(item?.unit);
      // Incomplete rows are skipped: the editor previews while the user is still typing.
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !unit)
        return;
      items.push({
        quantity: String(quantity),
        unit,
        ingredientProduct: product,
        index,
      });
    });
    errors.throwIfAny();
    const ancestors = new Set<string>(
      typeof input.outputProductId === "string" ? [input.outputProductId] : [],
    );
    const result = await this.calculate(
      { yieldQuantity: String(yieldQuantity), yieldUnit, items },
      ancestors,
    );
    return {
      yieldQuantity: format(dec(String(yieldQuantity))),
      yieldUnit,
      ...result,
      items: result.items.map((row, position) => ({
        ...row,
        index: items[position].index,
      })),
      skippedRows: rawItems.length - items.length,
    };
  }

  async getRecipeCost(id: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        outputProduct: true,
        items: { include: { ingredientProduct: true } },
      },
    });
    if (!recipe) throw new NotFoundException("Receta no encontrada");
    const result = await this.calculate(
      recipe,
      new Set([recipe.outputProductId]),
    );
    if (dec(recipe.yieldQuantity.toString()).lte(0))
      throw new NotFoundException("La receta tiene un rendimiento inválido");
    return {
      data: {
        recipeId: recipe.id,
        outputProduct: {
          id: recipe.outputProduct.id,
          name: recipe.outputProduct.name,
          unit: recipe.outputProduct.unit,
        },
        yieldQuantity: format(dec(recipe.yieldQuantity.toString())),
        yieldUnit: recipe.yieldUnit,
        ...result,
      },
    };
  }
}
