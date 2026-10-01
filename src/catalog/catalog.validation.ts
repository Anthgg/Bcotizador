import { BadRequestException } from "@nestjs/common";
import { FieldErrors } from "../common/errors";
import { areUnitsCompatible, normalizeUnit } from "../common/units";
import type { CatalogResource } from "./catalog.service";

type FieldType =
  | "text"
  | "optionalText"
  | "number"
  | "optionalNumber"
  | "boolean"
  | "integer"
  | "enum"
  | "unit"
  | "optionalUnit"
  | "id"
  | "optionalId"
  | "stringArray"
  | "items"
  | "contact"
  | "readonly";
interface FieldRule {
  type: FieldType;
  label: string;
  required?: boolean;
  values?: readonly string[];
  /** Inclusive lower bound for numbers. */
  min?: number;
  /** Exclusive lower bound for numbers. */
  above?: number;
  max?: number;
  message?: string;
}
const rule = (
  type: FieldType,
  label: string,
  extra: Partial<FieldRule> = {},
): FieldRule => ({ type, label, ...extra });
const money = (label: string) => rule("optionalNumber", label, { min: 0 });
const readonlyCode = rule("readonly", "Código", {
  message: "El código se genera automáticamente.",
});

export const PRODUCT_TYPES = [
  "RAW_MATERIAL",
  "PREPARED_MATERIAL",
  "FINISHED_PRODUCT",
  "SERVICE",
] as const;
export const CUSTOMER_TYPES = ["STUDENT", "PORMENOR", "WHOLESALE"] as const;
export const DOCUMENT_TYPES = ["DNI", "RUC", "CE", "PASAPORTE"] as const;

const fields: Record<CatalogResource, Record<string, FieldRule>> = {
  products: {
    code: readonlyCode,
    costPerGram: rule("readonly", "Costo por gramo", {
      message: "El costo por gramo se calcula a partir del costo y la unidad.",
    }),
    costUnit: rule("readonly", "Unidad del costo", {
      message: "La unidad del costo es la unidad de medida del producto.",
    }),
    internalReference: rule("optionalText", "Referencia del maestro"),
    name: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre del producto.",
    }),
    productType: rule("enum", "Tipo", {
      values: PRODUCT_TYPES,
      message: "Selecciona el tipo de producto.",
    }),
    categoryId: rule("optionalId", "Categoría"),
    posCategoryId: rule("optionalId", "Categoría en punto de venta"),
    salesTax: rule("optionalNumber", "Impuesto de venta", { min: 0, max: 1 }),
    purchaseTax: rule("optionalNumber", "Impuesto de compra", {
      min: 0,
      max: 1,
    }),
    canSell: rule("boolean", "Se vende"),
    canBuy: rule("boolean", "Se compra"),
    posAvailable: rule("boolean", "Disponible en punto de venta"),
    isStockable: rule("boolean", "Inventariable"),
    salePrice: money("El precio de venta"),
    unitCost: money("El costo"),
    unit: rule("unit", "Unidad", {
      required: true,
      message: "Selecciona una unidad.",
    }),
    purchaseUnit: rule("optionalUnit", "Unidad de compra"),
    lengthCm: rule("optionalNumber", "El largo", { min: 0 }),
    widthCm: rule("optionalNumber", "El ancho", { min: 0 }),
    heightCm: rule("optionalNumber", "El alto", { min: 0 }),
    clayWeightG: rule("optionalNumber", "El peso de pasta", { min: 0 }),
    defaultClayId: rule("optionalId", "Pasta predeterminada"),
    defaultGlazeId: rule("optionalId", "Esmalte predeterminado"),
    isActive: rule("boolean", "Activo"),
  },
  "product-categories": {
    name: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre de la categoría.",
    }),
    parentId: rule("optionalId", "Categoría superior"),
  },
  "pos-categories": {
    name: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre de la categoría.",
    }),
    parentId: rule("optionalId", "Categoría superior"),
  },
  locations: {
    name: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre de la ubicación.",
    }),
    isActive: rule("boolean", "Activa"),
  },
  contacts: {
    displayName: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre del contacto.",
    }),
    identificationType: rule("optionalText", "Tipo de documento"),
    identificationNumber: rule("optionalText", "Número de documento"),
    street: rule("optionalText", "Dirección"),
    district: rule("optionalText", "Distrito"),
    province: rule("optionalText", "Provincia"),
    department: rule("optionalText", "Departamento"),
    country: rule("optionalText", "País"),
    email: rule("optionalText", "Correo"),
    phone: rule("optionalText", "Teléfono"),
    bankAccount: rule("optionalText", "Cuenta bancaria"),
    bankName: rule("optionalText", "Banco"),
    roles: rule("stringArray", "Roles"),
    isActive: rule("boolean", "Activo"),
  },
  customers: {
    code: readonlyCode,
    displayName: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre o la razón social del cliente.",
    }),
    customerType: rule("enum", "Tipo de cliente", {
      values: CUSTOMER_TYPES,
      message: "Selecciona el tipo de cliente.",
    }),
    contactId: rule("optionalId", "Contacto"),
    contact: rule("contact", "Datos de contacto"),
    isActive: rule("boolean", "Activo"),
  },
  recipes: {
    outputProductId: rule("id", "Producto preparado", {
      required: true,
      message: "Selecciona el producto preparado.",
    }),
    yieldQuantity: rule("number", "El rendimiento", {
      required: true,
      above: 0,
      message: "Ingresa el rendimiento de la receta.",
    }),
    yieldUnit: rule("unit", "Unidad de rendimiento", {
      required: true,
      message: "Selecciona la unidad de rendimiento.",
    }),
    items: rule("items", "Ingredientes"),
  },
  workers: {
    code: readonlyCode,
    name: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre del trabajador.",
    }),
    workerType: rule("enum", "Tipo", {
      values: ["INTERNAL", "EXTERNAL"],
      message: "Selecciona el tipo de trabajador.",
    }),
    dailyRate: money("La tarifa diaria"),
    hoursPerDay: rule("optionalNumber", "La jornada", { above: 0, max: 24 }),
    isActive: rule("boolean", "Activo"),
  },
  techniques: {
    code: readonlyCode,
    name: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre de la técnica.",
    }),
    rule: rule("enum", "Regla", {
      values: ["UN_FACTOR", "DOS_FACTORES", "SIMPLE"],
      message: "Selecciona la regla de rendimiento.",
    }),
    factor1: rule("optionalNumber", "El primer rendimiento", { above: 0 }),
    factor2: rule("optionalNumber", "El segundo rendimiento", { above: 0 }),
    cycleRate: money("El costo por ciclo"),
    isActive: rule("boolean", "Activa"),
  },
  kilns: {
    code: readonlyCode,
    name: rule("text", "Nombre", {
      required: true,
      message: "Ingresa el nombre del horno.",
    }),
    class: rule("optionalText", "Clase"),
    capacityCm3: rule("number", "La capacidad", {
      required: true,
      above: 0,
      message: "Ingresa la capacidad del horno en cm³.",
    }),
    lowRate: rule("number", "La tarifa de primera quema", {
      required: true,
      min: 0,
      message: "Ingresa la tarifa de primera quema.",
    }),
    highRate: rule("number", "La tarifa de segunda quema", {
      required: true,
      min: 0,
      message: "Ingresa la tarifa de segunda quema.",
    }),
    isActive: rule("boolean", "Activo"),
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteDecimal(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || value.trim() === "") return false;
  return (
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) &&
    Number.isFinite(Number(value))
  );
}

function checkNumber(
  errors: FieldErrors,
  path: string,
  value: unknown,
  fieldRule: FieldRule,
) {
  if (!isFiniteDecimal(value)) {
    errors.add(path, `${fieldRule.label} debe ser un número.`);
    return;
  }
  const n = Number(value);
  if (fieldRule.above != null && n <= fieldRule.above)
    errors.add(
      path,
      `${fieldRule.label} debe ser mayor que ${fieldRule.above === 0 ? "cero" : fieldRule.above}.`,
    );
  else if (fieldRule.min != null && n < fieldRule.min)
    errors.add(
      path,
      `${fieldRule.label} debe ser mayor o igual a ${fieldRule.min === 0 ? "cero" : fieldRule.min}.`,
    );
  else if (fieldRule.max != null && n > fieldRule.max)
    errors.add(
      path,
      `${fieldRule.label} no puede ser mayor que ${fieldRule.max}.`,
    );
}

function checkValue(
  errors: FieldErrors,
  path: string,
  value: unknown,
  fieldRule: FieldRule,
  output: Record<string, unknown>,
  key: string,
) {
  const nullable = [
    "optionalText",
    "optionalNumber",
    "optionalUnit",
    "optionalId",
  ].includes(fieldRule.type);
  if (value === null || (nullable && value === "")) {
    if (nullable) {
      output[key] = null;
      return;
    }
    errors.add(
      path,
      fieldRule.message ?? `Completa el campo «${fieldRule.label}».`,
    );
    return;
  }
  switch (fieldRule.type) {
    case "readonly":
      errors.add(
        path,
        fieldRule.message ?? `${fieldRule.label} no se puede editar.`,
      );
      return;
    case "text":
    case "optionalText":
    case "id":
    case "optionalId":
      if (typeof value !== "string" || !value.trim())
        errors.add(
          path,
          fieldRule.message ?? `Completa el campo «${fieldRule.label}».`,
        );
      else output[key] = value.trim();
      return;
    case "number":
    case "optionalNumber":
      checkNumber(errors, path, value, fieldRule);
      return;
    case "boolean":
      if (typeof value !== "boolean")
        errors.add(
          path,
          `Indica si el registro está ${fieldRule.label.toLowerCase()}.`,
        );
      return;
    case "integer":
      if (!Number.isSafeInteger(value))
        errors.add(path, `${fieldRule.label} debe ser un número entero.`);
      return;
    case "stringArray":
      if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === "string")
      )
        errors.add(path, `${fieldRule.label} tiene un formato inválido.`);
      return;
    case "enum":
      if (typeof value !== "string" || !fieldRule.values?.includes(value))
        errors.add(path, fieldRule.message ?? "Selecciona una opción válida.");
      return;
    case "unit":
    case "optionalUnit": {
      const unit = normalizeUnit(value);
      if (!unit)
        errors.add(path, fieldRule.message ?? "Selecciona una unidad.");
      else output[key] = unit;
      return;
    }
  }
}

function checkRecipeItems(
  errors: FieldErrors,
  value: unknown,
  output: Record<string, unknown>,
) {
  if (!Array.isArray(value)) {
    errors.add("items", "Agrega los ingredientes de la receta.");
    return;
  }
  if (value.length === 0) {
    errors.add("items", "Agrega al menos un ingrediente.");
    return;
  }
  const normalized: Record<string, unknown>[] = [];
  value.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!isRecord(item)) {
      errors.add(path, "El ingrediente tiene un formato inválido.");
      return;
    }
    for (const key of Object.keys(item)) {
      if (!["ingredientProductId", "quantity", "unit"].includes(key))
        errors.add(
          `${path}.${key}`,
          `El campo «${key}» no está permitido en un ingrediente.`,
        );
    }
    if (
      typeof item.ingredientProductId !== "string" ||
      !item.ingredientProductId.trim()
    )
      errors.add(`${path}.ingredientProductId`, "Selecciona el ingrediente.");
    if (!isFiniteDecimal(item.quantity))
      errors.add(`${path}.quantity`, "Ingresa la cantidad.");
    else if (Number(item.quantity) <= 0)
      errors.add(`${path}.quantity`, "La cantidad debe ser mayor que cero.");
    const unit = normalizeUnit(item.unit);
    if (!unit) errors.add(`${path}.unit`, "Selecciona una unidad.");
    normalized.push({
      ingredientProductId: item.ingredientProductId,
      quantity: item.quantity,
      unit: unit ?? item.unit,
    });
  });
  output.items = normalized;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates nested customer contact data; DNI has 8 digits and RUC 11. */
export function checkContact(
  errors: FieldErrors,
  value: unknown,
  output: Record<string, unknown>,
  prefix = "contact",
) {
  if (value == null) {
    output.contact = undefined;
    return;
  }
  if (!isRecord(value)) {
    errors.add(prefix, "Los datos de contacto tienen un formato inválido.");
    return;
  }
  const allowed = [
    "identificationType",
    "identificationNumber",
    "email",
    "phone",
    "street",
  ];
  const result: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.includes(key)) {
      errors.add(`${prefix}.${key}`, `El campo «${key}» no está permitido.`);
      continue;
    }
    if (raw == null || raw === "") {
      result[key] = null;
      continue;
    }
    if (typeof raw !== "string") {
      errors.add(`${prefix}.${key}`, "Revisa este dato.");
      continue;
    }
    result[key] = raw.trim() || null;
  }
  const type = result.identificationType,
    number = result.identificationNumber;
  if (type && !DOCUMENT_TYPES.includes(type as (typeof DOCUMENT_TYPES)[number]))
    errors.add(
      `${prefix}.identificationType`,
      "Selecciona un tipo de documento.",
    );
  if (number && !type)
    errors.add(
      `${prefix}.identificationType`,
      "Selecciona el tipo de documento.",
    );
  if (type && !number)
    errors.add(
      `${prefix}.identificationNumber`,
      "Ingresa el número de documento.",
    );
  if (type === "DNI" && number && !/^\d{8}$/.test(number))
    errors.add(`${prefix}.identificationNumber`, "El DNI tiene 8 dígitos.");
  if (type === "RUC" && number && !/^(10|15|17|20)\d{9}$/.test(number))
    errors.add(
      `${prefix}.identificationNumber`,
      "El RUC tiene 11 dígitos y empieza con 10, 15, 17 o 20.",
    );
  if (
    (type === "CE" || type === "PASAPORTE") &&
    number &&
    !/^[A-Za-z0-9-]{6,15}$/.test(number)
  )
    errors.add(
      `${prefix}.identificationNumber`,
      "Revisa el número de documento.",
    );
  if (result.email && !emailPattern.test(result.email))
    errors.add(`${prefix}.email`, "Ingresa un correo válido.");
  if (result.phone && !/^[+\d][\d\s()-]{5,19}$/.test(result.phone))
    errors.add(`${prefix}.phone`, "Ingresa un teléfono válido.");
  output.contact = result;
}

/**
 * Validates and normalizes a catalog payload before the generic Prisma delegate receives it.
 * Returns a copy with canonical units; throws a 400 with one message per field.
 */
export function validateCatalogBody(
  resource: CatalogResource,
  body: unknown,
  updating = false,
): Record<string, any> {
  const schema = fields[resource];
  if (!schema) throw new BadRequestException("Recurso de catálogo desconocido");
  if (!isRecord(body))
    throw new BadRequestException("El cuerpo debe ser un objeto");
  const errors = new FieldErrors();
  const output: Record<string, unknown> = { ...body };
  for (const key of Object.keys(body)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key))
      errors.add(key, `El campo «${key}» no se puede modificar aquí.`);
  }
  if (!updating) {
    for (const [key, fieldRule] of Object.entries(schema)) {
      if (
        fieldRule.required &&
        (body[key] === undefined || body[key] === null || body[key] === "")
      )
        errors.add(
          key,
          fieldRule.message ?? `Completa el campo «${fieldRule.label}».`,
        );
    }
  }
  for (const [key, value] of Object.entries(body)) {
    const fieldRule = schema[key];
    if (!fieldRule || value === undefined || errors.has(key)) continue;
    if (fieldRule.type === "items") checkRecipeItems(errors, value, output);
    else if (fieldRule.type === "contact") checkContact(errors, value, output);
    else checkValue(errors, key, value, fieldRule, output, key);
  }
  if (
    resource === "products" &&
    output.unit &&
    output.purchaseUnit &&
    !areUnitsCompatible(String(output.unit), String(output.purchaseUnit))
  ) {
    errors.add(
      "purchaseUnit",
      "La unidad de compra debe ser compatible con la unidad de medida.",
    );
  }
  errors.throwIfAny();
  return output;
}

/** Cross-field rules for techniques once the stored values are merged with the payload. */
export function validateTechniqueRule(merged: Record<string, any>) {
  const errors = new FieldErrors();
  const positive = (value: unknown) =>
    value != null && value !== "" && Number(value) > 0;
  if (merged.rule === "UN_FACTOR" || merged.rule === "DOS_FACTORES") {
    if (!positive(merged.factor1))
      errors.add("factor1", "Indica cuántas piezas se hacen por ciclo.");
  }
  if (merged.rule === "DOS_FACTORES" && !positive(merged.factor2))
    errors.add("factor2", "Indica el segundo rendimiento por ciclo.");
  errors.throwIfAny();
}

export function validateWorkerTechniqueBody(
  body: unknown,
): asserts body is Record<string, unknown> {
  validateRelationBody(body, {
    factor1Override: rule("optionalNumber", "El primer rendimiento", {
      above: 0,
    }),
    factor2Override: rule("optionalNumber", "El segundo rendimiento", {
      above: 0,
    }),
    rateOverride: money("La tarifa por ciclo"),
    cycleRateOverride: money("La tarifa por ciclo"),
    isActive: rule("boolean", "Activa"),
  });
}

export function validateProductTechniqueBody(
  body: unknown,
): asserts body is Record<string, unknown> {
  validateRelationBody(body, {
    defaultWorkerId: rule("optionalId", "Trabajador"),
    order: rule("integer", "El orden"),
    isRequired: rule("boolean", "Requerida"),
  });
}

function validateRelationBody(
  body: unknown,
  schema: Record<string, FieldRule>,
): asserts body is Record<string, unknown> {
  if (!isRecord(body))
    throw new BadRequestException("El cuerpo debe ser un objeto");
  const errors = new FieldErrors();
  for (const [key, value] of Object.entries(body)) {
    const fieldRule = schema[key];
    if (!fieldRule) {
      errors.add(
        key,
        `El campo «${key}» no está permitido para esta relación.`,
      );
      continue;
    }
    if (value !== undefined) checkValue(errors, key, value, fieldRule, {}, key);
  }
  errors.throwIfAny();
}
