import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { RecipeCostService } from '../recipes/recipe-cost.service';
import { validateCatalogBody, validateProductTechniqueBody, validateWorkerTechniqueBody } from './catalog.validation';

export type CatalogResource = 'products' | 'product-categories' | 'pos-categories' | 'contacts' | 'customers' | 'recipes' | 'workers' | 'techniques' | 'kilns';
const delegates: Record<CatalogResource, string> = {
  products: 'product', 'product-categories': 'productCategory', 'pos-categories': 'posCategory',
  contacts: 'contact', customers: 'customer', recipes: 'recipe', workers: 'worker', techniques: 'technique', kilns: 'kiln',
};
const includes: Partial<Record<CatalogResource, object>> = {
  products: { category: true, posCategory: true },
  'product-categories': { parent: true, children: true },
  'pos-categories': { parent: true, children: true },
  contacts: { customer: true }, customers: { contact: true },
  recipes: { outputProduct: true, items: { include: { ingredientProduct: true } } },
  workers: { techniques: { include: { technique: true } } },
  techniques: { workers: { include: { worker: true } } },
};
@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService, private audit: AuditService, private recipeCosts: RecipeCostService) {}
  private delegate(resource: CatalogResource): any {
    const name = delegates[resource]; const db = this.prisma as any;
    if (!name || !db[name]) throw new BadRequestException('Recurso de catálogo desconocido');
    return db[name];
  }
  async list(resource: CatalogResource, query: Record<string, string | undefined>) {
    const d = this.delegate(resource);
    const where: any = {};
    const activeResources: CatalogResource[] = ['products', 'contacts', 'customers', 'workers', 'techniques', 'kilns'];
    if (query.isActive !== undefined && activeResources.includes(resource)) where.isActive = query.isActive === 'true';
    if (query.q) {
      const field = resource === 'contacts' || resource === 'customers' ? 'displayName' : 'name';
      where[field] = { contains: query.q, mode: 'insensitive' };
    }
    if (query.productType && resource === 'products') where.productType = query.productType;
    if (query.categoryId && resource === 'products') where.categoryId = query.categoryId;
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50) || 50));
    const orderField = resource === 'contacts' || resource === 'customers' ? 'displayName' : 'name';
    const [data, total] = await Promise.all([
      d.findMany({ where, include: includes[resource], orderBy: { [orderField]: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      d.count({ where }),
    ]);
    return { data, pagination: { total, page, pageSize } };
  }
  async get(resource: CatalogResource, id: string) {
    const row = await this.delegate(resource).findUnique({ where: { id }, include: includes[resource] });
    if (!row) throw new NotFoundException('Registro no encontrado');
    return row;
  }
  async create(resource: CatalogResource, body: unknown, actorId: string) {
    this.delegate(resource);
    validateCatalogBody(resource, body);
    const data = this.normalizeData(resource, body, false);
    return this.prisma.$transaction(async tx => {
      const created = await (tx as any)[delegates[resource]].create({ data, include: includes[resource] });
      await this.audit.write(actorId, 'CREATE', resource, created.id, null, created, tx);
      return created;
    });
  }
  async update(resource: CatalogResource, id: string, body: unknown, actorId: string) {
    this.delegate(resource);
    validateCatalogBody(resource, body, true);
    const data = this.normalizeData(resource, body, true);
    return this.prisma.$transaction(async tx => {
      const d = (tx as any)[delegates[resource]];
      const before = await d.findUnique({ where: { id }, include: includes[resource] });
      if (!before) throw new NotFoundException('Registro no encontrado');
      const after = await d.update({ where: { id }, data, include: includes[resource] });
      await this.audit.write(actorId, 'UPDATE', resource, id, before, after, tx);
      return after;
    });
  }
  async remove(resource: CatalogResource, id: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const d = (tx as any)[delegates[resource]];
      const before = await d.findUnique({ where: { id }, include: includes[resource] });
      if (!before) throw new NotFoundException('Registro no encontrado');
      await d.delete({ where: { id } });
      await this.audit.write(actorId, 'DELETE', resource, id, before, null, tx);
      return { id, deleted: true };
    });
  }
  async recipeCost(id: string) {
    return this.recipeCosts.getRecipeCost(id);
  }
  private normalizeData(resource: CatalogResource, body: Record<string, any>, replacing: boolean) {
    const data = { ...body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    if (resource === 'recipes' && Object.prototype.hasOwnProperty.call(body, 'items')) {
      if (!Array.isArray(body.items)) throw new BadRequestException('items debe ser una lista de ingredientes');
      const items = body.items.map((item: Record<string, any>) => {
        if (!item?.ingredientProductId || item.quantity == null || !item.unit) {
          throw new BadRequestException('Cada ingrediente requiere ingredientProductId, quantity y unit');
        }
        return { ingredientProductId: item.ingredientProductId, quantity: item.quantity, unit: item.unit };
      });
      data.items = replacing ? { deleteMany: {}, create: items } : { create: items };
    }
    return data;
  }
  async workerTechniques(workerId: string) {
    return this.prisma.workerTechnique.findMany({ where: { workerId }, include: { technique: true }, orderBy: { technique: { name: 'asc' } } });
  }
  async setWorkerTechnique(workerId: string, techniqueId: string, body: unknown, actorId: string) {
    validateWorkerTechniqueBody(body);
    const relationBody = body as Record<string, any>;
    return this.prisma.$transaction(async tx => {
      const key = { workerId_techniqueId: { workerId, techniqueId } };
      const before = await tx.workerTechnique.findUnique({ where: key, include: { technique: true, worker: true } });
      const after = await tx.workerTechnique.upsert({
        where: key,
        create: { workerId, techniqueId, factor1Override: relationBody.factor1Override ?? null, factor2Override: relationBody.factor2Override ?? null, rateOverride: relationBody.rateOverride ?? relationBody.cycleRateOverride ?? null, isActive: relationBody.isActive ?? true },
        update: { factor1Override: relationBody.factor1Override ?? null, factor2Override: relationBody.factor2Override ?? null, rateOverride: relationBody.rateOverride ?? relationBody.cycleRateOverride ?? null, isActive: relationBody.isActive ?? true },
        include: { technique: true, worker: true },
      });
      await this.audit.write(actorId, before ? 'UPDATE' : 'CREATE', 'WorkerTechnique', workerId + ':' + techniqueId, before, after, tx);
      return after;
    });
  }
  async deleteWorkerTechnique(workerId: string, techniqueId: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const key = { workerId_techniqueId: { workerId, techniqueId } };
      const before = await tx.workerTechnique.findUnique({ where: key, include: { technique: true, worker: true } });
      if (!before) throw new NotFoundException('Relación no encontrada');
      await tx.workerTechnique.delete({ where: key });
      await this.audit.write(actorId, 'DELETE', 'WorkerTechnique', workerId + ':' + techniqueId, before, null, tx);
      return { workerId, techniqueId, deleted: true };
    });
  }
  async productTechniques(productId: string) {
    return this.prisma.productTechnique.findMany({ where: { productId }, include: { technique: true, defaultWorker: true }, orderBy: [{ order: 'asc' }, { technique: { name: 'asc' } }] });
  }
  async setProductTechnique(productId: string, techniqueId: string, body: unknown, actorId: string) {
    validateProductTechniqueBody(body);
    const relationBody = body as Record<string, any>;
    return this.prisma.$transaction(async tx => {
      const key = { productId_techniqueId: { productId, techniqueId } };
      const before = await tx.productTechnique.findUnique({ where: key, include: { technique: true, defaultWorker: true } });
      const after = await tx.productTechnique.upsert({
        where: key,
        create: { productId, techniqueId, defaultWorkerId: relationBody.defaultWorkerId ?? null, order: Number(relationBody.order ?? 0), isRequired: relationBody.isRequired ?? true },
        update: { defaultWorkerId: relationBody.defaultWorkerId ?? null, order: Number(relationBody.order ?? 0), isRequired: relationBody.isRequired ?? true },
        include: { technique: true, defaultWorker: true },
      });
      await this.audit.write(actorId, before ? 'UPDATE' : 'CREATE', 'ProductTechnique', productId + ':' + techniqueId, before, after, tx);
      return after;
    });
  }
  async deleteProductTechnique(productId: string, techniqueId: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const key = { productId_techniqueId: { productId, techniqueId } };
      const before = await tx.productTechnique.findUnique({ where: key, include: { technique: true, defaultWorker: true } });
      if (!before) throw new NotFoundException('Relación no encontrada');
      await tx.productTechnique.delete({ where: key });
      await this.audit.write(actorId, 'DELETE', 'ProductTechnique', productId + ':' + techniqueId, before, null, tx);
      return { productId, techniqueId, deleted: true };
    });
  }
}
