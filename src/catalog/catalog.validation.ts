import { BadRequestException } from '@nestjs/common';
import type { CatalogResource } from './catalog.service';

type FieldType = 'string' | 'nullableString' | 'number' | 'nullableNumber' | 'boolean' | 'integer' | 'stringArray' | 'enum';
interface FieldRule {
  type: FieldType;
  requiredOnCreate?: boolean;
  values?: readonly string[];
}

const field = (type: FieldType, requiredOnCreate = false, values?: readonly string[]): FieldRule => ({ type, requiredOnCreate, values });

const fields: Record<CatalogResource, Record<string, FieldRule>> = {
  products: {
    internalReference: field('nullableString'), name: field('string', true),
    productType: field('enum', false, ['RAW_MATERIAL', 'PREPARED_MATERIAL', 'FINISHED_PRODUCT', 'SERVICE']),
    categoryId: field('nullableString'), posCategoryId: field('nullableString'),
    salesTax: field('nullableNumber'), purchaseTax: field('nullableNumber'),
    canSell: field('boolean'), canBuy: field('boolean'), posAvailable: field('boolean'),
    salePrice: field('nullableNumber'), unitCost: field('nullableNumber'), costPerGram: field('nullableNumber'),
    costUnit: field('nullableString'), unit: field('string'), purchaseUnit: field('nullableString'), isActive: field('boolean'),
  },
  'product-categories': { name: field('string', true), parentId: field('nullableString') },
  'pos-categories': { name: field('string', true), parentId: field('nullableString') },
  contacts: {
    displayName: field('string', true), identificationType: field('nullableString'), identificationNumber: field('nullableString'),
    street: field('nullableString'), district: field('nullableString'), province: field('nullableString'),
    department: field('nullableString'), country: field('nullableString'), email: field('nullableString'), phone: field('nullableString'),
    bankAccount: field('nullableString'), bankName: field('nullableString'), roles: field('stringArray'), isActive: field('boolean'),
  },
  customers: {
    displayName: field('string', true), customerType: field('string'), contactId: field('nullableString'), isActive: field('boolean'),
  },
  recipes: {
    outputProductId: field('string', true), yieldQuantity: field('number', true), yieldUnit: field('string', true), items: field('stringArray'),
  },
  workers: {
    code: field('nullableString'), name: field('string', true), workerType: field('enum', false, ['INTERNAL', 'EXTERNAL']),
    dailyRate: field('nullableNumber'), hoursPerDay: field('nullableNumber'), isActive: field('boolean'),
  },
  techniques: {
    code: field('nullableString'), name: field('string', true), rule: field('enum', false, ['UN_FACTOR', 'DOS_FACTORES', 'SIMPLE']),
    factor1: field('nullableNumber'), factor2: field('nullableNumber'), cycleRate: field('nullableNumber'), isActive: field('boolean'),
  },
  kilns: {
    code: field('nullableString'), name: field('string', true), class: field('nullableString'),
    capacityCm3: field('number', true), lowRate: field('number', true), highRate: field('number', true), isActive: field('boolean'),
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteDecimal(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value));
}

function validateValue(path: string, value: unknown, rule: FieldRule): void {
  if (value === null && (rule.type === 'nullableString' || rule.type === 'nullableNumber')) return;
  let valid = false;
  switch (rule.type) {
    case 'string':
    case 'nullableString':
      valid = typeof value === 'string' && value.trim().length > 0;
      break;
    case 'number':
    case 'nullableNumber':
      valid = isFiniteDecimal(value);
      break;
    case 'boolean':
      valid = typeof value === 'boolean';
      break;
    case 'integer':
      valid = Number.isSafeInteger(value);
      break;
    case 'stringArray':
      valid = Array.isArray(value) && value.every(item => typeof item === 'string');
      break;
    case 'enum':
      valid = typeof value === 'string' && !!rule.values?.includes(value);
      break;
  }
  if (!valid) throw new BadRequestException(`${path} tiene un valor o tipo inválido`);
}

function validateRecipeItems(value: unknown): void {
  if (!Array.isArray(value)) throw new BadRequestException('items debe ser una lista de ingredientes');
  value.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!isRecord(item)) throw new BadRequestException(`${path} debe ser un objeto`);
    const allowed = new Set(['ingredientProductId', 'quantity', 'unit']);
    for (const key of Object.keys(item)) {
      if (!allowed.has(key)) throw new BadRequestException(`${path}.${key} no está permitido`);
    }
    for (const required of ['ingredientProductId', 'quantity', 'unit']) {
      if (!(required in item)) throw new BadRequestException(`${path}.${required} es obligatorio`);
    }
    validateValue(`${path}.ingredientProductId`, item.ingredientProductId, field('string'));
    validateValue(`${path}.quantity`, item.quantity, field('number'));
    validateValue(`${path}.unit`, item.unit, field('string'));
  });
}

/** Validates the resource-specific shape before the generic Prisma delegate receives it. */
export function validateCatalogBody(resource: CatalogResource, body: unknown, updating = false): asserts body is Record<string, any> {
  const schema = fields[resource];
  if (!schema) throw new BadRequestException('Recurso de catálogo desconocido');
  if (!isRecord(body)) throw new BadRequestException('El cuerpo debe ser un objeto');

  for (const key of Object.keys(body)) {
    if (!Object.prototype.hasOwnProperty.call(schema, key)) throw new BadRequestException(`El campo ${key} no está permitido para ${resource}`);
  }
  if (!updating) {
    for (const [key, rule] of Object.entries(schema)) {
      if (rule.requiredOnCreate && body[key] === undefined) throw new BadRequestException(`${key} es obligatorio`);
    }
  }
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (resource === 'recipes' && key === 'items') validateRecipeItems(value);
    else validateValue(key, value, schema[key]);
  }
}

export function validateWorkerTechniqueBody(body: unknown): asserts body is Record<string, unknown> {
  validateRelationBody(body, {
    factor1Override: field('nullableNumber'), factor2Override: field('nullableNumber'),
    rateOverride: field('nullableNumber'), cycleRateOverride: field('nullableNumber'), isActive: field('boolean'),
  });
}

export function validateProductTechniqueBody(body: unknown): asserts body is Record<string, unknown> {
  validateRelationBody(body, {
    defaultWorkerId: field('nullableString'), order: field('integer'), isRequired: field('boolean'),
  });
}

function validateRelationBody(body: unknown, schema: Record<string, FieldRule>): asserts body is Record<string, unknown> {
  if (!isRecord(body)) throw new BadRequestException('El cuerpo debe ser un objeto');
  for (const [key, value] of Object.entries(body)) {
    const rule = schema[key];
    if (!rule) throw new BadRequestException(`El campo ${key} no está permitido para esta relación`);
    if (value !== undefined) validateValue(key, value, rule);
  }
}
