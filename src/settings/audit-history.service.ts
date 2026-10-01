import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { unitLabel } from "../common/units";

type Json = Record<string, any> | null;
export interface FieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}
export interface ReadableEvent {
  id: string;
  createdAt: Date;
  actor: string;
  action: string;
  actionLabel: string;
  entity: string;
  section: string;
  record: string;
  summary: string;
  changes: FieldChange[];
}

/** Normalizes the historical entity names (resource slugs and model names) to one section. */
const ENTITY_SECTIONS: Record<string, { section: string; group: string }> = {
  CommercialSettings: { section: "Comercial", group: "settings" },
  CompanyProfile: { section: "Empresa", group: "settings" },
  CompanyLogo: { section: "Empresa", group: "settings" },
  DocumentSettings: { section: "Documentos", group: "settings" },
  NumberSequence: { section: "Numeración", group: "settings" },
  User: { section: "Usuarios", group: "users" },
  products: { section: "Productos", group: "products" },
  Product: { section: "Productos", group: "products" },
  customers: { section: "Clientes", group: "customers" },
  Customer: { section: "Clientes", group: "customers" },
  contacts: { section: "Contactos", group: "customers" },
  Contact: { section: "Contactos", group: "customers" },
  workers: { section: "Trabajadores", group: "workers" },
  Worker: { section: "Trabajadores", group: "workers" },
  WorkerTechnique: { section: "Trabajadores", group: "workers" },
  techniques: { section: "Técnicas", group: "techniques" },
  Technique: { section: "Técnicas", group: "techniques" },
  ProductTechnique: { section: "Productos", group: "products" },
  kilns: { section: "Hornos", group: "kilns" },
  Kiln: { section: "Hornos", group: "kilns" },
  recipes: { section: "Recetas", group: "recipes" },
  Recipe: { section: "Recetas", group: "recipes" },
  InventoryMovement: { section: "Inventario", group: "inventory" },
  locations: { section: "Inventario", group: "inventory" },
  Quotation: { section: "Cotizaciones", group: "quotations" },
  ImportBatch: { section: "Importación", group: "imports" },
  "product-categories": { section: "Categorías", group: "products" },
  ProductCategory: { section: "Categorías", group: "products" },
  "pos-categories": { section: "Categorías", group: "products" },
  PosCategory: { section: "Categorías", group: "products" },
};
const QUOTER_FIELDS = new Set([
  "glazeDefaultPct",
  "separationXcm",
  "separationYcm",
  "separationZcm",
  "hoursPerCycle",
  "dayAdjustments",
  "priceRounding",
  "defaultFiringType",
  "defaultLowFiringEnabled",
  "defaultHighFiringEnabled",
  "defaultLowKilnId",
  "defaultHighKilnId",
  "validityDays",
]);
const ACTIONS: Record<string, string> = {
  CREATE: "Creó",
  UPDATE: "Editó",
  DELETE: "Eliminó",
  CONFIRM: "Confirmó",
  CANCEL: "Canceló",
};
const LABELS: Record<string, string> = {
  glazeDefaultPct: "Esmalte por defecto",
  separationXcm: "Separación X",
  separationYcm: "Separación Y",
  separationZcm: "Separación Z",
  productionFactorDefault: "Factor de producción",
  productionFactorMin: "Factor mínimo",
  igvRate: "IGV",
  rentPerDay: "Alquiler por día",
  utilitiesPerDay: "Servicios por día",
  administrativeCost: "Costo administrativo",
  hoursPerCycle: "Horas por ciclo",
  validityDays: "Vigencia (días)",
  dayAdjustments: "Ajustes de días",
  priceRounding: "Redondeo del precio",
  defaultFiringType: "Tipo de hornada",
  defaultLowFiringEnabled: "Primera quema activa",
  defaultHighFiringEnabled: "Segunda quema activa",
  defaultLowKilnId: "Horno de primera quema",
  defaultHighKilnId: "Horno de segunda quema",
  legalName: "Razón social",
  tradeName: "Nombre comercial",
  ruc: "RUC",
  address: "Dirección",
  addressReference: "Referencia",
  ubigeoCode: "Ubigeo",
  department: "Departamento",
  province: "Provincia",
  district: "Distrito",
  country: "País",
  postalCode: "Código postal",
  phone: "Teléfono",
  mobile: "Celular",
  email: "Correo",
  website: "Sitio web",
  contactName: "Persona de contacto",
  contactRole: "Cargo",
  mimeType: "Logo",
  fileName: "Archivo del logo",
  size: "Tamaño del logo",
  showLogo: "Mostrar logo",
  showLegalName: "Mostrar razón social",
  showRuc: "Mostrar RUC",
  showAddress: "Mostrar dirección",
  showPhones: "Mostrar teléfonos",
  showEmail: "Mostrar correo",
  showWebsite: "Mostrar web",
  validityText: "Texto de validez",
  conditions: "Condiciones",
  observations: "Observaciones",
  estimatedTime: "Tiempo estimado",
  paymentTerms: "Forma de pago",
  bankName: "Banco",
  bankAccountHolder: "Titular",
  bankAccount: "Número de cuenta",
  bankCci: "CCI",
  closingMessage: "Mensaje final",
  showSignature: "Mostrar firma",
  signatureName: "Responsable",
  signatureRole: "Cargo del responsable",
  prefix: "Prefijo",
  padding: "Dígitos",
  displayName: "Nombre",
  role: "Rol",
  isActive: "Activo",
  name: "Nombre",
  productType: "Tipo",
  unit: "Unidad",
  purchaseUnit: "Unidad de compra",
  unitCost: "Costo",
  salePrice: "Precio de venta",
  canSell: "Se vende",
  canBuy: "Se compra",
  posAvailable: "Punto de venta",
  isStockable: "Inventariable",
  categoryId: "Categoría",
  posCategoryId: "Categoría PdV",
  salesTax: "Impuesto de venta",
  purchaseTax: "Impuesto de compra",
  lengthCm: "Largo",
  widthCm: "Ancho",
  heightCm: "Alto",
  clayWeightG: "Peso de pasta",
  defaultClayId: "Pasta predeterminada",
  defaultGlazeId: "Esmalte predeterminado",
  customerType: "Tipo de cliente",
  workerType: "Tipo de trabajador",
  dailyRate: "Tarifa diaria",
  hoursPerDay: "Jornada",
  rule: "Regla",
  factor1: "Rendimiento 1",
  factor2: "Rendimiento 2",
  cycleRate: "Costo por ciclo",
  capacityCm3: "Capacidad",
  lowRate: "Tarifa primera quema",
  highRate: "Tarifa segunda quema",
  yieldQuantity: "Rendimiento",
  yieldUnit: "Unidad de rendimiento",
  status: "Estado",
  total: "Total",
  validityDaysQuote: "Vigencia",
  productionFactor: "Factor de producción",
  factor1Override: "Rendimiento 1 propio",
  factor2Override: "Rendimiento 2 propio",
  rateOverride: "Tarifa propia",
  defaultWorkerId: "Trabajador predeterminado",
  order: "Orden",
  isRequired: "Requerida",
  quantity: "Cantidad",
  type: "Tipo",
  reason: "Motivo",
};
const PERCENT = new Set([
  "igvRate",
  "glazeDefaultPct",
  "salesTax",
  "purchaseTax",
]);
const MONEY = new Set([
  "rentPerDay",
  "utilitiesPerDay",
  "administrativeCost",
  "unitCost",
  "salePrice",
  "dailyRate",
  "cycleRate",
  "lowRate",
  "highRate",
  "total",
  "rateOverride",
]);
const VALUE_LABELS: Record<string, Record<string, string>> = {
  priceRounding: {
    NONE: "Sin redondeo",
    UP_1: "Al sol superior",
    UP_5: "A S/ 5 superior",
    UP_10: "A S/ 10 superior",
  },
  defaultFiringType: { SHARED: "Compartida", EXCLUSIVE: "Exclusiva" },
  productType: {
    RAW_MATERIAL: "Materia prima",
    PREPARED_MATERIAL: "Material preparado",
    FINISHED_PRODUCT: "Producto terminado",
    SERVICE: "Servicio",
  },
  customerType: {
    STUDENT: "Alumno",
    PORMENOR: "Pormenor",
    WHOLESALE: "Por mayor",
  },
  workerType: { INTERNAL: "Interno", EXTERNAL: "Externo" },
  rule: {
    UN_FACTOR: "Un tramo de rendimiento",
    DOS_FACTORES: "Dos tramos de rendimiento",
    SIMPLE: "Por unidad",
  },
  role: {
    ADMIN: "Administrador",
    OPERARIO: "Operario",
    TESTER: "Solo lectura",
  },
  status: {
    DRAFT: "Borrador",
    CONFIRMED: "Confirmada",
    CANCELLED: "Cancelada",
    PREVIEW: "Vista previa",
  },
  type: {
    OPENING_BALANCE: "Saldo inicial",
    ENTRY: "Entrada",
    EXIT: "Salida",
    ADJUSTMENT: "Ajuste",
  },
};
const IGNORED = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "passwordHash",
  "inputSnapshot",
  "economicSnapshot",
  "preview",
  "rawData",
  "costPerGram",
  "costUnit",
  "sha256",
  "data",
]);

function trimNumber(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  return Number(value).toLocaleString("es-PE", { maximumFractionDigits: 6 });
}

export function formatAuditValue(
  field: string,
  value: unknown,
  record?: Json,
): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) {
    if (field === "dayAdjustments")
      return value.length
        ? value
            .map(
              (row: any) => `${row?.label ?? "Ajuste"}: ${row?.days ?? row} d`,
            )
            .join(", ")
        : "Sin ajustes";
    return value.map(String).join(", ");
  }
  if (typeof value === "object") return null;
  const raw = String(value);
  if (VALUE_LABELS[field]?.[raw]) return VALUE_LABELS[field][raw];
  if (field.endsWith("Id")) {
    const related = record?.[field.slice(0, -2)];
    if (related && typeof related === "object")
      return String(related.name ?? related.displayName ?? related.code ?? raw);
    return "Registro relacionado";
  }
  if (PERCENT.has(field) && /^-?\d+(\.\d+)?$/.test(raw))
    return (
      (Number(raw) * 100).toLocaleString("es-PE", {
        maximumFractionDigits: 2,
      }) + "%"
    );
  if (MONEY.has(field) && /^-?\d+(\.\d+)?$/.test(raw))
    return (
      "S/ " +
      Number(raw).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  if (field === "unit" || field === "purchaseUnit" || field === "yieldUnit")
    return unitLabel(raw);
  if (field === "size" && /^\d+$/.test(raw))
    return (
      (Number(raw) / 1024).toLocaleString("es-PE", {
        maximumFractionDigits: 0,
      }) + " KB"
    );
  if (field === "mimeType") return raw.replace("image/", "").toUpperCase();
  return trimNumber(raw);
}

export function diffAudit(before: Json, after: Json): FieldChange[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changes: FieldChange[] = [];
  for (const field of keys) {
    if (IGNORED.has(field)) continue;
    const left = before?.[field],
      right = after?.[field];
    if (left && typeof left === "object" && !Array.isArray(left)) continue;
    if (right && typeof right === "object" && !Array.isArray(right)) continue;
    if (JSON.stringify(left ?? null) === JSON.stringify(right ?? null))
      continue;
    const formattedBefore = formatAuditValue(field, left, before),
      formattedAfter = formatAuditValue(field, right, after);
    if (formattedBefore === formattedAfter) continue;
    changes.push({
      field,
      label: LABELS[field] ?? field,
      before: formattedBefore,
      after: formattedAfter,
    });
  }
  return changes;
}

function recordName(entity: string, row: Json, entityId: string): string {
  if (entity === "CommercialSettings") return "Parámetros comerciales";
  if (entity === "CompanyProfile") return "Datos de la empresa";
  if (entity === "CompanyLogo") return "Logo de la empresa";
  if (entity === "DocumentSettings") return "Documentos y PDF";
  if (entity === "NumberSequence") return row?.label ?? entityId;
  if (!row) return entityId;
  if (entity === "WorkerTechnique")
    return `${row.worker?.name ?? "Trabajador"} · ${row.technique?.name ?? "Técnica"}`;
  if (entity === "ProductTechnique")
    return `${row.technique?.name ?? "Técnica"}`;
  if (entity === "InventoryMovement")
    return row.movement?.code ?? row.code ?? "Movimiento";
  const name =
    row.code && (row.name || row.displayName)
      ? `${row.code} · ${row.name ?? row.displayName}`
      : (row.code ??
        row.name ??
        row.displayName ??
        row.email ??
        row.outputProduct?.name ??
        row.fileName);
  return String(name ?? entityId);
}

@Injectable()
export class AuditHistoryService {
  constructor(private prisma: PrismaService) {}

  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(query.pageSize ?? 25) || 25),
    );
    const group = query.group && query.group !== "all" ? query.group : null;
    const entities = group
      ? Object.entries(ENTITY_SECTIONS)
          .filter(([, value]) => value.group === group)
          .map(([key]) => key)
      : null;
    const where: any = entities ? { entity: { in: entities } } : {};
    if (query.action) where.action = query.action;
    const [rows, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { actor: { select: { displayName: true, email: true } } },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.readable(row)),
      pagination: { total, page, pageSize },
    };
  }

  readable(row: {
    id: string;
    createdAt: Date;
    action: string;
    entity: string;
    entityId: string;
    beforeJson: unknown;
    afterJson: unknown;
    actor?: { displayName: string; email: string } | null;
  }): ReadableEvent {
    const before = (
      row.beforeJson && typeof row.beforeJson === "object"
        ? row.beforeJson
        : null
    ) as Json;
    const after = (
      row.afterJson && typeof row.afterJson === "object" ? row.afterJson : null
    ) as Json;
    const mapping = ENTITY_SECTIONS[row.entity] ?? {
      section: row.entity,
      group: "other",
    };
    // Settings creations are stored against their defaults, so they also show what changed.
    let changes =
      row.action === "UPDATE" ||
      row.entity === "CompanyLogo" ||
      (row.action === "CREATE" && before && after)
        ? diffAudit(before, after)
        : [];
    if (row.entity === "InventoryMovement") {
      const movement = (after?.movement ?? {}) as Record<string, any>;
      changes = [
        {
          field: "type",
          label: "Tipo",
          before: null,
          after: formatAuditValue("type", movement.type),
        },
        {
          field: "quantity",
          label: "Cantidad",
          before: null,
          after: `${formatAuditValue("quantity", movement.quantity)} ${unitLabel(movement.unit)}`,
        },
        {
          field: "balance",
          label: "Saldo",
          before: formatAuditValue("balance", before?.balance),
          after: formatAuditValue("balance", after?.balance),
        },
      ];
    }
    let section = mapping.section;
    if (
      row.entity === "CommercialSettings" &&
      changes.length &&
      changes.every((change) => QUOTER_FIELDS.has(change.field))
    )
      section = "Cotizador";
    const record = recordName(row.entity, after ?? before, row.entityId);
    const actionLabel = ACTIONS[row.action] ?? row.action;
    const outcomes: Record<string, string> = {
      CREATE: "Registro nuevo",
      DELETE: "Registro eliminado",
      CONFIRM: "Emitida",
      CANCEL: "Anulada",
    };
    const summary =
      row.action === "UPDATE" || changes.length
        ? changes.length
          ? `${changes.length} ${changes.length === 1 ? "cambio" : "cambios"}`
          : "Sin cambios visibles"
        : (outcomes[row.action] ?? actionLabel);
    return {
      id: row.id,
      createdAt: row.createdAt,
      actor: row.actor?.displayName ?? row.actor?.email ?? "Sistema",
      action: row.action,
      actionLabel,
      entity: row.entity,
      section,
      record,
      summary,
      changes,
    };
  }
}
