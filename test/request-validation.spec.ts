import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CalculatorInputDto } from '../src/calculator/calculator.dto';
import { ProductTechniqueBodyDto, WorkerTechniqueBodyDto } from '../src/catalog/catalog.dto';
import { strictBodyPipe } from '../src/common/strict-body.pipe';

const transformBody = (value: unknown, metatype: new (...args: any[]) => unknown) =>
  strictBodyPipe.transform(value, { type: 'body', metatype });

test('calculator DTO accepts the frontend quotation draft and validates nested numeric fields', async () => {
  const result = await transformBody({
    customerId: 'customer-1', validityDays: 30, productionFactor: '3', productionDays: 0,
    items: [{
      productId: 'product-1', name: 'Plato', quantity: 2, lengthCm: 10, widthCm: 9, heightCm: 4,
      clayWeightG: 500, clayProductId: 'clay-1', glazeProductId: 'glaze-1', glazePercent: '0.15',
      laborTasks: [{ techniqueId: 'tech-1', workerId: 'worker-1', quantity: 2, factor1: 10, appliedHours: 8 }],
      firings: [{ stage: 'LOW', enabled: true, kilnId: 'kiln-1', firingType: 'SHARED', occupancy: 0.25 }],
    }],
  }, CalculatorInputDto) as CalculatorInputDto;

  assert.equal(result.productionFactor, 3);
  assert.equal(result.items[0].glazePercent, 0.15);
  assert.equal(result.items[0].laborTasks[0].appliedHours, 8);
  assert.equal(result.items[0].firings[0].occupancy, 0.25);
});

test('calculator DTO rejects unknown or malformed top-level and nested fields', async () => {
  const valid = { items: [{ quantity: 1, laborTasks: [], firings: [] }] };
  await assert.rejects(transformBody({ ...valid, debug: true }, CalculatorInputDto));
  await assert.rejects(transformBody({ items: [{ ...valid.items[0], extra: true }] }, CalculatorInputDto));
  await assert.rejects(transformBody({ items: [{ quantity: 1, laborTasks: [{ techniqueId: 't', quantity: 'oops' }], firings: [] }] }, CalculatorInputDto));
  await assert.rejects(transformBody({ items: [{ quantity: 1, laborTasks: [], firings: [{ stage: 'MEDIUM', enabled: true, firingType: 'SHARED' }] }] }, CalculatorInputDto));
});

test('relation DTOs retain supported override payloads and reject unknown or mistyped properties', async () => {
  const worker = await transformBody({ factor1Override: '10', cycleRateOverride: 25, isActive: false }, WorkerTechniqueBodyDto) as WorkerTechniqueBodyDto;
  assert.equal(worker.factor1Override, 10);
  assert.equal(worker.cycleRateOverride, 25);
  assert.equal(worker.isActive, false);

  const product = await transformBody({ defaultWorkerId: null, order: '2', isRequired: true }, ProductTechniqueBodyDto) as ProductTechniqueBodyDto;
  assert.equal(product.order, 2);
  assert.equal(product.defaultWorkerId, null);

  await assert.rejects(transformBody({ unexpected: 'value' }, WorkerTechniqueBodyDto));
  await assert.rejects(transformBody({ rateOverride: 'not-a-number' }, WorkerTechniqueBodyDto));
  await assert.rejects(transformBody({ order: '2.5' }, ProductTechniqueBodyDto));
  await assert.rejects(transformBody({ isRequired: 'yes' }, ProductTechniqueBodyDto));
});
