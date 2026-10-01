import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { dec } from '../common/money';
import { InventoryMovementType } from '../generated/prisma/enums';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  async list(query: Record<string, string | undefined>) {
    const where: any = { isActive: query.isActive === 'false' ? false : true };
    if (query.q) where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { internalReference: { contains: query.q, mode: 'insensitive' } },
    ];
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.productType) where.productType = query.productType;
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 100) || 100));
    const products = await this.prisma.product.findMany({
      where, include: { category: true }, orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize, take: pageSize,
    });
    const totals = await this.prisma.inventoryMovement.groupBy({
      by: ['productId'], where: query.locationId ? { locationId: query.locationId } : {},
      _sum: { quantity: true },
    });
    const totalByProduct = new Map(totals.map(row => [row.productId, row._sum.quantity?.toString() ?? '0']));
    const total = await this.prisma.product.count({ where });
    return {
      data: products.map(product => ({
        id: product.id, productId: product.id, internalReference: product.internalReference,
        productName: product.name, category: product.category?.name ?? null, categoryId: product.categoryId,
        unit: product.unit, locationId: query.locationId ?? null, locationName: query.locationId ?? 'Todas',
        quantity: totalByProduct.get(product.id) ?? '0', isActive: product.isActive,
      })),
      pagination: { total, page, pageSize },
    };
  }
  async movements(productId: string, query: Record<string, string | undefined>) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const rows = await this.prisma.inventoryMovement.findMany({
      where: { productId, ...(query.locationId ? { locationId: query.locationId } : {}) },
      include: { location: true, actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    return { product, data: rows };
  }
  async createMovement(input: { productId: string; locationId?: string; type: InventoryMovementType; quantity: string; unit: string; reason?: string }, actorId: string) {
    const requested = dec(input.quantity);
    if (requested.isZero()) throw new BadRequestException('La cantidad no puede ser cero');
    if ((input.type === InventoryMovementType.ENTRY || input.type === InventoryMovementType.OPENING_BALANCE || input.type === InventoryMovementType.EXIT) && requested.isNegative()) {
      throw new BadRequestException('Use una cantidad positiva para entrada, apertura o salida');
    }
    if (input.type === InventoryMovementType.ADJUSTMENT && requested.isZero()) throw new BadRequestException('El ajuste no puede ser cero');
    return this.prisma.$transaction(async tx => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      const location = input.locationId
        ? await tx.location.findUnique({ where: { id: input.locationId } })
        : await tx.location.upsert({ where: { name: 'Principal' }, create: { name: 'Principal' }, update: {} });
      if (!location) throw new NotFoundException('Ubicación no encontrada');
      const previous = await tx.inventoryMovement.aggregate({
        where: { productId: input.productId, locationId: location.id }, _sum: { quantity: true },
      });
      const beforeQty = dec(previous._sum.quantity?.toString());
      const signed = input.type === InventoryMovementType.EXIT ? requested.negated() : requested;
      const afterQty = beforeQty.plus(signed);
      if (afterQty.isNegative()) throw new BadRequestException('La salida supera el saldo disponible');
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: product.id, locationId: location.id, type: input.type,
          quantity: signed.toFixed(12), unit: input.unit, reason: input.reason ?? null, actorId,
        },
        include: { product: true, location: true },
      });
      await this.audit.write(actorId, 'CREATE', 'InventoryMovement', movement.id,
        { productId: product.id, locationId: location.id, balance: beforeQty.toFixed(12) },
        { movement, balance: afterQty.toFixed(12) }, tx);
      return { movement, balance: afterQty.toFixed(12) };
    });
  }
}
