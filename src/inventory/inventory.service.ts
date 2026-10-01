import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { SequenceService } from "../common/sequence.service";
import { dec } from "../common/money";
import { validationError } from "../common/errors";
import {
  convertQuantity,
  normalizeUnit,
  unitDefinition,
} from "../common/units";
import { InventoryMovementType } from "../generated/prisma/enums";

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Optional() private sequences?: SequenceService,
  ) {}
  async list(query: Record<string, string | undefined>) {
    const where: any = { isActive: query.isActive === "false" ? false : true };
    if (query.isStockable !== "all")
      where.isStockable = query.isStockable === "false" ? false : true;
    if (query.q?.trim())
      where.OR = [
        { name: { contains: query.q.trim(), mode: "insensitive" } },
        {
          internalReference: { contains: query.q.trim(), mode: "insensitive" },
        },
        { code: { contains: query.q.trim(), mode: "insensitive" } },
      ];
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.productType) where.productType = query.productType;
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      500,
      Math.max(1, Number(query.pageSize ?? 500) || 500),
    );
    const products = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
    });
    const totals = await this.prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: query.locationId ? { locationId: query.locationId } : {},
      _sum: { quantity: true },
    });
    const totalByProduct = new Map(
      totals.map((row) => [
        row.productId,
        row._sum.quantity?.toString() ?? "0",
      ]),
    );
    const rows = products.map((product) => ({
      id: product.id,
      productId: product.id,
      code: product.code,
      internalReference: product.internalReference,
      productName: product.name,
      productType: product.productType,
      category: product.category?.name ?? null,
      categoryId: product.categoryId,
      unit: product.unit,
      locationId: query.locationId ?? null,
      locationName: query.locationId ?? "Todas",
      quantity: totalByProduct.get(product.id) ?? "0",
      isActive: product.isActive,
    }));
    const summary = {
      products: rows.length,
      withStock: rows.filter((row) => dec(row.quantity).gt(0)).length,
      withoutStock: rows.filter((row) => !dec(row.quantity).gt(0)).length,
    };
    const filtered =
      query.stock === "positive"
        ? rows.filter((row) => dec(row.quantity).gt(0))
        : query.stock === "zero"
          ? rows.filter((row) => !dec(row.quantity).gt(0))
          : rows;
    return {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      pagination: { total: filtered.length, page, pageSize },
      summary,
    };
  }
  async movements(
    productId: string,
    query: Record<string, string | undefined>,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        productId,
        ...(query.locationId ? { locationId: query.locationId } : {}),
      },
      include: {
        location: true,
        actor: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { product, data: rows };
  }
  async createMovement(
    input: {
      productId: string;
      locationId?: string;
      type: InventoryMovementType;
      quantity: string;
      unit: string;
      reason?: string;
    },
    actorId: string,
  ) {
    const requested = dec(input.quantity);
    if (requested.isZero())
      throw validationError([
        {
          field: "quantity",
          message: "La cantidad debe ser distinta de cero.",
        },
      ]);
    if (
      input.type !== InventoryMovementType.ADJUSTMENT &&
      requested.isNegative()
    ) {
      throw validationError([
        { field: "quantity", message: "La cantidad debe ser mayor que cero." },
      ]);
    }
    const enteredUnit = normalizeUnit(input.unit);
    if (!enteredUnit)
      throw validationError([
        { field: "unit", message: "Selecciona una unidad." },
      ]);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: input.productId },
      });
      if (!product) throw new NotFoundException("Producto no encontrado");
      if (product.isStockable === false)
        throw new ConflictException(
          "Este producto no se controla en inventario. Actívalo como inventariable en su ficha.",
        );
      // Balances are always kept in the product's own unit; compatible units are converted.
      const productUnit = normalizeUnit(product.unit) ?? product.unit;
      const converted = unitDefinition(productUnit)
        ? convertQuantity(requested, enteredUnit, productUnit)
        : enteredUnit === productUnit
          ? requested
          : null;
      if (converted == null)
        throw validationError([
          {
            field: "unit",
            message: `Usa una unidad compatible con ${productUnit}.`,
          },
        ]);
      const location = input.locationId
        ? await tx.location.findUnique({ where: { id: input.locationId } })
        : await tx.location.upsert({
            where: { name: "Principal" },
            create: { name: "Principal" },
            update: {},
          });
      if (!location)
        throw validationError([
          { field: "locationId", message: "Selecciona una ubicación." },
        ]);
      const previous = await tx.inventoryMovement.aggregate({
        where: { productId: input.productId, locationId: location.id },
        _sum: { quantity: true },
      });
      const beforeQty = dec(previous._sum.quantity?.toString());
      const signed =
        input.type === InventoryMovementType.EXIT
          ? converted.negated()
          : converted;
      const afterQty = beforeQty.plus(signed);
      if (afterQty.isNegative())
        throw validationError([
          {
            field: "quantity",
            message: `La salida supera el saldo disponible en ${location.name} (${beforeQty.toDecimalPlaces(3).toString()} ${productUnit}).`,
          },
        ]);
      const code = this.sequences
        ? await this.sequences.next("MOVEMENT", tx)
        : undefined;
      const movement = await tx.inventoryMovement.create({
        data: {
          code,
          productId: product.id,
          locationId: location.id,
          type: input.type,
          quantity: signed.toFixed(12),
          unit: productUnit,
          reason: input.reason?.trim() || null,
          actorId,
        },
        include: { product: true, location: true },
      });
      await this.audit.write(
        actorId,
        "CREATE",
        "InventoryMovement",
        movement.id,
        {
          productId: product.id,
          locationId: location.id,
          balance: beforeQty.toFixed(12),
        },
        { movement, balance: afterQty.toFixed(12) },
        tx,
      );
      return { movement, balance: afterQty.toFixed(12) };
    });
  }
}
