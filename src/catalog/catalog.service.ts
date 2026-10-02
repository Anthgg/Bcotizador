import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { SequenceKey, SequenceService } from "../common/sequence.service";
import { RecipeCostService } from "../recipes/recipe-cost.service";
import { validationError } from "../common/errors";
import { convertQuantity, unitDefinition } from "../common/units";
import {
  validateCatalogBody,
  validateProductTechniqueBody,
  validateTechniqueRule,
  validateWorkerTechniqueBody,
} from "./catalog.validation";

export type CatalogResource =
  | "products"
  | "product-categories"
  | "pos-categories"
  | "contacts"
  | "customers"
  | "recipes"
  | "workers"
  | "techniques"
  | "kilns"
  | "locations";
const delegates: Record<CatalogResource, string> = {
  products: "product",
  "product-categories": "productCategory",
  "pos-categories": "posCategory",
  contacts: "contact",
  customers: "customer",
  recipes: "recipe",
  workers: "worker",
  techniques: "technique",
  kilns: "kiln",
  locations: "location",
};
const productBrief = {
  select: { id: true, code: true, name: true, unit: true, productType: true },
};
const includes: Partial<Record<CatalogResource, object>> = {
  products: {
    category: true,
    posCategory: true,
    defaultClay: productBrief,
    defaultGlaze: productBrief,
    outputRecipe: { select: { id: true } },
  },
  "product-categories": { parent: true, children: true },
  "pos-categories": { parent: true, children: true },
  contacts: { customer: true },
  customers: { contact: true },
  recipes: {
    outputProduct: true,
    items: { include: { ingredientProduct: true } },
  },
  workers: { techniques: { include: { technique: true } } },
  techniques: { workers: { include: { worker: true } } },
};
const sequenceKeys: Partial<Record<CatalogResource, SequenceKey>> = {
  products: "PRODUCT",
  customers: "CUSTOMER",
  workers: "WORKER",
  techniques: "TECHNIQUE",
  kilns: "KILN",
};
const contains = (q: string) => ({ contains: q, mode: "insensitive" });
const search: Partial<Record<CatalogResource, (q: string) => object>> = {
  products: (q) => ({
    OR: [
      { name: contains(q) },
      { code: contains(q) },
      { internalReference: contains(q) },
    ],
  }),
  customers: (q) => ({
    OR: [
      { displayName: contains(q) },
      { code: contains(q) },
      { contact: { identificationNumber: contains(q) } },
      { contact: { email: contains(q) } },
    ],
  }),
  contacts: (q) => ({
    OR: [{ displayName: contains(q) }, { identificationNumber: contains(q) }],
  }),
  workers: (q) => ({ OR: [{ name: contains(q) }, { code: contains(q) }] }),
  techniques: (q) => ({ OR: [{ name: contains(q) }, { code: contains(q) }] }),
  kilns: (q) => ({ OR: [{ name: contains(q) }, { code: contains(q) }] }),
  recipes: (q) => ({
    outputProduct: {
      OR: [
        { name: contains(q) },
        { code: contains(q) },
        { internalReference: contains(q) },
      ],
    },
  }),
};
const activeResources: CatalogResource[] = [
  "products",
  "contacts",
  "customers",
  "workers",
  "techniques",
  "kilns",
  "locations",
];
const entityNames: Partial<Record<CatalogResource, string>> = {
  products: "Producto",
  customers: "Cliente",
  workers: "Trabajador",
  techniques: "Técnica",
  kilns: "Horno",
  recipes: "Receta",
  "product-categories": "Categoría",
  "pos-categories": "Categoría de punto de venta",
  contacts: "Contacto",
  locations: "Ubicación",
};

/** Cost per gram is derived from the unit cost when the product is measured by mass. */
export function deriveProductCost(
  unit: string | null | undefined,
  unitCost: unknown,
): { costUnit: string | null; costPerGram: string | null } {
  const definition = unitDefinition(unit);
  if (!definition) return { costUnit: unit ?? null, costPerGram: null };
  if (unitCost == null || unitCost === "" || definition.dimension !== "mass")
    return { costUnit: definition.code, costPerGram: null };
  const perGram = convertQuantity(1, "g", definition.code);
  return {
    costUnit: definition.code,
    costPerGram:
      perGram == null ? null : perGram.mul(String(unitCost)).toString(),
  };
}

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private recipeCosts: RecipeCostService,
    @Optional() private sequences?: SequenceService,
  ) {}
  private delegate(resource: CatalogResource): any {
    const name = delegates[resource];
    const db = this.prisma as any;
    if (!name || !db[name])
      throw new NotFoundException("Recurso de catálogo desconocido");
    return db[name];
  }
  async list(
    resource: CatalogResource,
    query: Record<string, string | undefined>,
  ) {
    const d = this.delegate(resource);
    const where: any = {};
    if (query.isActive !== undefined && activeResources.includes(resource))
      where.isActive = query.isActive === "true";
    if (query.q?.trim()) {
      const q = query.q.trim();
      const build = search[resource];
      if (build) Object.assign(where, build(q));
      else where.name = contains(q);
    }
    if (resource === "products") {
      if (query.productType) {
        const types = query.productType
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        where.productType = types.length > 1 ? { in: types } : types[0];
      }
      if (query.categoryId) where.categoryId = query.categoryId;
      if (query.isStockable !== undefined)
        where.isStockable = query.isStockable === "true";
    }
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      500,
      Math.max(1, Number(query.pageSize ?? 500) || 500),
    );
    const orderField =
      resource === "contacts" || resource === "customers"
        ? "displayName"
        : "name";
    const orderBy =
      resource === "recipes"
        ? { outputProduct: { name: "asc" } }
        : { [orderField]: "asc" };
    const [data, total] = await Promise.all([
      d.findMany({
        where,
        include: includes[resource],
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      d.count({ where }),
    ]);
    const listedData =
      resource === "recipes"
        ? await Promise.all(
            data.map(async (recipe: any) => {
              const { data: cost } = await this.recipeCosts.getRecipeCost(
                recipe.id,
              );
              return {
                ...recipe,
                unitCost: cost.unitCost,
                totalCost: cost.totalCost,
                costStatus: cost.costStatus,
              };
            }),
          )
        : data;
    return { data: listedData, pagination: { total, page, pageSize } };
  }
  async get(resource: CatalogResource, id: string) {
    const row = await this.delegate(resource).findUnique({
      where: { id },
      include: includes[resource],
    });
    if (!row)
      throw new NotFoundException(
        `${entityNames[resource] ?? "Registro"} no encontrado.`,
      );
    return row;
  }
  async create(resource: CatalogResource, body: unknown, actorId: string) {
    this.delegate(resource);
    const validated = validateCatalogBody(resource, body, false);
    if (resource === "techniques")
      validateTechniqueRule({ rule: "SIMPLE", ...validated });
    if (resource === "products")
      await this.assertUniqueProductName(String(validated.name));
    return this.prisma.$transaction(async (tx) => {
      const data = this.normalizeData(resource, validated, false, null);
      if (resource === "customers")
        await this.applyCustomerContact(tx, data, null);
      const sequence = sequenceKeys[resource];
      if (sequence && this.sequences)
        data.code = await this.sequences.next(sequence, tx);
      const created = await (tx as any)[delegates[resource]].create({
        data,
        include: includes[resource],
      });
      await this.audit.write(
        actorId,
        "CREATE",
        resource,
        created.id,
        null,
        created,
        tx,
      );
      return created;
    });
  }
  async update(
    resource: CatalogResource,
    id: string,
    body: unknown,
    actorId: string,
  ) {
    this.delegate(resource);
    const validated = validateCatalogBody(resource, body, true);
    return this.prisma.$transaction(async (tx) => {
      const d = (tx as any)[delegates[resource]];
      const before = await d.findUnique({
        where: { id },
        include: includes[resource],
      });
      if (!before)
        throw new NotFoundException(
          `${entityNames[resource] ?? "Registro"} no encontrado.`,
        );
      if (resource === "techniques")
        validateTechniqueRule({ ...before, ...validated });
      if (
        resource === "products" &&
        validated.name &&
        String(validated.name).toLowerCase() !==
          String(before.name).toLowerCase()
      ) {
        await this.assertUniqueProductName(String(validated.name), id);
      }
      const data = this.normalizeData(resource, validated, true, before);
      if (resource === "customers")
        await this.applyCustomerContact(tx, data, before);
      const after = await d.update({
        where: { id },
        data,
        include: includes[resource],
      });
      await this.audit.write(
        actorId,
        "UPDATE",
        resource,
        id,
        before,
        after,
        tx,
      );
      return after;
    });
  }
  async remove(resource: CatalogResource, id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const d = (tx as any)[delegates[resource]];
      const before = await d.findUnique({
        where: { id },
        include: includes[resource],
      });
      if (!before)
        throw new NotFoundException(
          `${entityNames[resource] ?? "Registro"} no encontrado.`,
        );
      await d.delete({ where: { id } });
      await this.audit.write(actorId, "DELETE", resource, id, before, null, tx);
      return { id, deleted: true };
    });
  }
  async recipeCost(id: string) {
    return this.recipeCosts.getRecipeCost(id);
  }
  private async assertUniqueProductName(name: string, exceptId?: string) {
    const product = (this.prisma as any).product;
    if (!product?.findFirst) return;
    const existing = await product.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true, code: true },
    });
    if (existing) {
      const message = `Este producto ya existe${existing.code ? ` (${existing.code})` : ""}.`;
      throw new ConflictException({
        code: "DUPLICATE",
        message,
        details: [{ field: "name", message }],
      });
    }
  }
  private normalizeData(
    resource: CatalogResource,
    body: Record<string, any>,
    replacing: boolean,
    before: Record<string, any> | null,
  ) {
    const data = { ...body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.code;
    if (resource === "workers") {
      const workerType = data.workerType ?? before?.workerType;
      const typeChanged =
        data.workerType != null && data.workerType !== before?.workerType;
      if (
        data.billingMode == null &&
        (!replacing || typeChanged)
      ) {
        data.billingMode =
          workerType === "EXTERNAL" ? "HOURLY" : "INTERNAL_INCLUDED";
      }
      const billingMode = data.billingMode ?? before?.billingMode;
      if (workerType === "EXTERNAL" && billingMode !== "HOURLY")
        throw new BadRequestException(
          "Un trabajador externo debe facturarse por hora.",
        );
    }
    if (
      resource === "recipes" &&
      Object.prototype.hasOwnProperty.call(body, "items")
    ) {
      if (!Array.isArray(body.items))
        throw new BadRequestException(
          "items debe ser una lista de ingredientes",
        );
      const items = body.items.map((item: Record<string, any>) => ({
        ingredientProductId: item.ingredientProductId,
        quantity: item.quantity,
        unit: item.unit,
      }));
      if (
        items.some(
          (item: any) =>
            item.ingredientProductId ===
            (body.outputProductId ?? before?.outputProductId),
        )
      ) {
        throw validationError([
          {
            field: "items",
            message:
              "Un producto no puede ser ingrediente de su propia receta.",
          },
        ]);
      }
      data.items = replacing
        ? { deleteMany: {}, create: items }
        : { create: items };
    }
    if (resource === "products") {
      const type = data.productType ?? before?.productType;
      if (type === "SERVICE") data.isStockable = false;
      if ("unit" in data || "unitCost" in data) {
        const unit = data.unit ?? before?.unit;
        const unitCost =
          "unitCost" in data ? data.unitCost : before?.unitCost?.toString();
        Object.assign(data, deriveProductCost(unit, unitCost));
      }
    }
    return data;
  }
  /** Customers carry document, email and phone through their linked contact; the user never picks contact IDs. */
  private async applyCustomerContact(
    tx: any,
    data: Record<string, any>,
    before: Record<string, any> | null,
  ) {
    const contact = data.contact as Record<string, string | null> | undefined;
    delete data.contact;
    if (!contact) return;
    const hasData = Object.values(contact).some(
      (value) => value != null && value !== "",
    );
    const displayName = data.displayName ?? before?.displayName;
    const contactId = data.contactId ?? before?.contactId ?? null;
    if (contactId) {
      if (contact.identificationNumber)
        await this.assertDocumentFree(
          tx,
          contact.identificationNumber,
          contactId,
        );
      await tx.contact.update({
        where: { id: contactId },
        data: { ...contact, displayName },
      });
      return;
    }
    if (!hasData) return;
    if (contact.identificationNumber) {
      const existing = await tx.contact.findUnique({
        where: { identificationNumber: contact.identificationNumber },
        include: { customer: true },
      });
      if (existing) {
        if (existing.customer && existing.customer.id !== before?.id) {
          const message = `Ya existe un cliente con ese documento (${existing.customer.displayName}).`;
          throw new ConflictException({
            code: "DUPLICATE",
            message,
            details: [{ field: "contact.identificationNumber", message }],
          });
        }
        await tx.contact.update({
          where: { id: existing.id },
          data: { ...contact, displayName },
        });
        data.contactId = existing.id;
        return;
      }
    }
    const created = await tx.contact.create({
      data: { ...contact, displayName, roles: ["CUSTOMER"] },
    });
    data.contactId = created.id;
  }
  private async assertDocumentFree(
    tx: any,
    identificationNumber: string,
    contactId: string,
  ) {
    const existing = await tx.contact.findUnique({
      where: { identificationNumber },
    });
    if (existing && existing.id !== contactId) {
      const message = "Ese número de documento ya pertenece a otro contacto.";
      throw new ConflictException({
        code: "DUPLICATE",
        message,
        details: [{ field: "contact.identificationNumber", message }],
      });
    }
  }
  async workerTechniques(workerId: string) {
    return this.prisma.workerTechnique.findMany({
      where: { workerId },
      include: { technique: true },
      orderBy: { technique: { name: "asc" } },
    });
  }
  async setWorkerTechnique(
    workerId: string,
    techniqueId: string,
    body: unknown,
    actorId: string,
  ) {
    validateWorkerTechniqueBody(body);
    const relationBody = body as Record<string, any>;
    return this.prisma.$transaction(async (tx) => {
      const key = { workerId_techniqueId: { workerId, techniqueId } };
      const before = await tx.workerTechnique.findUnique({
        where: key,
        include: { technique: true, worker: true },
      });
      const after = await tx.workerTechnique.upsert({
        where: key,
        create: {
          workerId,
          techniqueId,
          factor1Override: relationBody.factor1Override ?? null,
          factor2Override: relationBody.factor2Override ?? null,
          productivityOverride: relationBody.productivityOverride ?? null,
          rateOverride:
            relationBody.rateOverride ?? relationBody.cycleRateOverride ?? null,
          isActive: relationBody.isActive ?? true,
        },
        update: {
          factor1Override: relationBody.factor1Override ?? null,
          factor2Override: relationBody.factor2Override ?? null,
          productivityOverride: relationBody.productivityOverride ?? null,
          rateOverride:
            relationBody.rateOverride ?? relationBody.cycleRateOverride ?? null,
          isActive: relationBody.isActive ?? true,
        },
        include: { technique: true, worker: true },
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "WorkerTechnique",
        workerId + ":" + techniqueId,
        before,
        after,
        tx,
      );
      return after;
    });
  }
  async deleteWorkerTechnique(
    workerId: string,
    techniqueId: string,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const key = { workerId_techniqueId: { workerId, techniqueId } };
      const before = await tx.workerTechnique.findUnique({
        where: key,
        include: { technique: true, worker: true },
      });
      if (!before)
        throw new NotFoundException("La técnica ya no está asignada.");
      await tx.workerTechnique.delete({ where: key });
      await this.audit.write(
        actorId,
        "DELETE",
        "WorkerTechnique",
        workerId + ":" + techniqueId,
        before,
        null,
        tx,
      );
      return { workerId, techniqueId, deleted: true };
    });
  }
  async productTechniques(productId: string) {
    return this.prisma.productTechnique.findMany({
      where: { productId },
      include: { technique: true, defaultWorker: true },
      orderBy: [{ order: "asc" }, { technique: { name: "asc" } }],
    });
  }
  async techniqueWorkers(techniqueId: string) {
    return this.prisma.workerTechnique.findMany({
      where: { techniqueId },
      include: { worker: true },
      orderBy: { worker: { name: "asc" } },
    });
  }
  async setProductTechnique(
    productId: string,
    techniqueId: string,
    body: unknown,
    actorId: string,
  ) {
    validateProductTechniqueBody(body);
    const relationBody = body as Record<string, any>;
    return this.prisma.$transaction(async (tx) => {
      const key = { productId_techniqueId: { productId, techniqueId } };
      const before = await tx.productTechnique.findUnique({
        where: key,
        include: { technique: true, defaultWorker: true },
      });
      const after = await tx.productTechnique.upsert({
        where: key,
        create: {
          productId,
          techniqueId,
          defaultWorkerId: relationBody.defaultWorkerId ?? null,
          order: Number(relationBody.order ?? 0),
          isRequired: relationBody.isRequired ?? true,
        },
        update: {
          defaultWorkerId: relationBody.defaultWorkerId ?? null,
          order: Number(relationBody.order ?? 0),
          isRequired: relationBody.isRequired ?? true,
        },
        include: { technique: true, defaultWorker: true },
      });
      await this.audit.write(
        actorId,
        before ? "UPDATE" : "CREATE",
        "ProductTechnique",
        productId + ":" + techniqueId,
        before,
        after,
        tx,
      );
      return after;
    });
  }
  async deleteProductTechnique(
    productId: string,
    techniqueId: string,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const key = { productId_techniqueId: { productId, techniqueId } };
      const before = await tx.productTechnique.findUnique({
        where: key,
        include: { technique: true, defaultWorker: true },
      });
      if (!before)
        throw new NotFoundException(
          "La técnica ya no está asociada al producto.",
        );
      await tx.productTechnique.delete({ where: key });
      await this.audit.write(
        actorId,
        "DELETE",
        "ProductTechnique",
        productId + ":" + techniqueId,
        before,
        null,
        tx,
      );
      return { productId, techniqueId, deleted: true };
    });
  }
}
