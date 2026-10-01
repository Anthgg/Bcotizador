import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogService } from '../src/catalog/catalog.service';
import { validateCatalogBody, validateProductTechniqueBody, validateWorkerTechniqueBody } from '../src/catalog/catalog.validation';

test('recipe CRUD writes ingredients through nested Prisma relations and replaces them on update', async () => {
  const calls: any[] = [];
  const recipeDelegate = {
    create: async (args: any) => { calls.push(['create', args]); return { id: 'recipe-1', ...args.data }; },
    findUnique: async () => ({ id: 'recipe-1', outputProductId: 'prepared', items: [] }),
    update: async (args: any) => { calls.push(['update', args]); return { id: 'recipe-1', ...args.data }; },
  };
  const prisma: any = {
    recipe: recipeDelegate,
    $transaction: async (work: (tx: any) => Promise<any>) => work({ recipe: recipeDelegate }),
  };
  const audit: any = { write: async () => undefined };
  const service = new CatalogService(prisma, audit, {} as any);
  const items = [{ ingredientProductId: 'clay', quantity: 500, unit: 'g' }];

  await service.create('recipes', { outputProductId: 'prepared', yieldQuantity: 1000, yieldUnit: 'g', items }, 'admin');
  assert.deepEqual(calls[0][1].data.items, { create: items });

  await service.update('recipes', 'recipe-1', { items }, 'admin');
  assert.deepEqual(calls[1][1].data.items, { deleteMany: {}, create: items });
});

test('category listing ignores unsupported active filter and orders by name', async () => {
  let args: any;
  const delegate = {
    findMany: async (value: any) => { args = value; return []; },
    count: async () => 0,
  };
  const prisma: any = { productCategory: delegate };
  const service = new CatalogService(prisma, {} as any, {} as any);
  await service.list('product-categories', { isActive: 'true', q: 'Clay' });
  assert.deepEqual(args.where, { name: { contains: 'Clay', mode: 'insensitive' } });
  assert.deepEqual(args.orderBy, { name: 'asc' });
});

test('catalog allowlists accept supported create/update payloads and reject unknown or resource-mismatched fields', () => {
  assert.doesNotThrow(() => validateCatalogBody('products', {
    name: 'Arcilla', productType: 'RAW_MATERIAL', unit: 'g', unitCost: '0.001', costPerGram: 0.001,
    internalReference: null, categoryId: null, canSell: false, canBuy: true, isActive: true,
  }));
  assert.doesNotThrow(() => validateCatalogBody('workers', { dailyRate: '110', hoursPerDay: 8 }, true));
  assert.doesNotThrow(() => validateCatalogBody('recipes', {
    outputProductId: 'prepared-1', yieldQuantity: '1000', yieldUnit: 'g',
    items: [{ ingredientProductId: 'clay-1', quantity: '500', unit: 'g' }],
  }));

  assert.throws(() => validateCatalogBody('workers', { name: 'Ana', productType: 'RAW_MATERIAL' }), /no está permitido/);
  assert.throws(() => validateCatalogBody('products', { name: 'Arcilla', id: 'caller-id' }), /no está permitido/);
  assert.throws(() => validateCatalogBody('products', { name: 'Arcilla', productType: 'OTHER' }), /inválido/);
  assert.throws(() => validateCatalogBody('products', { name: 'Arcilla', unitCost: 'NaN' }), /inválido/);
  assert.throws(() => validateCatalogBody('workers', { dailyRate: 110 }), /name es obligatorio/);
  assert.throws(() => validateCatalogBody('workers', { name: 'Ana', isActive: 'true' }, true), /inválido/);
  assert.throws(() => validateCatalogBody('recipes', {
    outputProductId: 'prepared-1', yieldQuantity: 1000, yieldUnit: 'g',
    items: [{ ingredientProductId: 'clay-1', quantity: 500, unit: 'g', id: 'foreign-id' }],
  }), /no está permitido/);
});

test('relation allowlists accept supported fields and reject unknown or invalid values', () => {
  assert.doesNotThrow(() => validateWorkerTechniqueBody({ factor1Override: 10, cycleRateOverride: '80', isActive: true }));
  assert.doesNotThrow(() => validateProductTechniqueBody({ defaultWorkerId: null, order: 2, isRequired: false }));
  assert.throws(() => validateWorkerTechniqueBody({ workerId: 'caller-controlled' }), /no está permitido/);
  assert.throws(() => validateProductTechniqueBody({ order: 1.5 }), /inválido/);
});
