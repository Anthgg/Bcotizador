import test from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import {
  FiringType,
  ProductType,
  TechniqueRule,
} from "../src/generated/prisma/enums";
import {
  calculateFiringCost,
  calculateLaborCycles,
  CalculatorService,
} from "../src/calculator/calculator.service";
import { roundCommercial } from "../src/common/money";

const settings = {
  id: "default",
  glazeDefaultPct: "0.15",
  separationXcm: "3",
  separationYcm: "3",
  separationZcm: "3",
  productionFactorDefault: "3",
  productionFactorMin: "2",
  igvRate: "0.18",
  rentPerDay: "110",
  utilitiesPerDay: "10",
  administrativeCost: "200",
  hoursPerCycle: "8",
  validityDays: 30,
  dayAdjustments: [],
};
function calculator({
  products = {},
  techniques = {},
  workers = {},
  workerTechniques = {},
  kilns = {},
}: any = {}) {
  const prisma: any = {
    commercialSettings: { findUnique: async () => settings },
    product: {
      findUnique: async ({ where }: any) => products[where.id] ?? null,
    },
    technique: {
      findUnique: async ({ where }: any) => techniques[where.id] ?? null,
    },
    worker: { findUnique: async ({ where }: any) => workers[where.id] ?? null },
    workerTechnique: {
      findUnique: async ({ where }: any) =>
        workerTechniques[
          `${where.workerId_techniqueId.workerId}:${where.workerId_techniqueId.techniqueId}`
        ] ?? null,
    },
    kiln: { findUnique: async ({ where }: any) => kilns[where.id] ?? null },
  };
  return new CalculatorService(prisma, {
    costPerUnit: async () => null,
  } as any);
}
const product = (id: string, name: string, costPerGram: string | null) => ({
  id,
  name,
  productType: ProductType.RAW_MATERIAL,
  unit: "g",
  costUnit: "g",
  purchaseUnit: "g",
  costPerGram: costPerGram == null ? null : new Decimal(costPerGram),
  unitCost: null,
});
const technique = (
  id: string,
  name: string,
  rule: TechniqueRule,
  factor1: string | null,
  factor2: string | null,
  cycleRate: string,
) => ({
  id,
  name,
  rule,
  isActive: true,
  factor1: factor1 == null ? null : new Decimal(factor1),
  factor2: factor2 == null ? null : new Decimal(factor2),
  cycleRate: new Decimal(cycleRate),
});
const worker = (id: string, name: string, dailyRate = "110") => ({
  id,
  name,
  workerType: "EXTERNAL",
  billingMode: "HOURLY",
  dailyRate: new Decimal(dailyRate),
  hoursPerDay: new Decimal(8),
  isActive: true,
});
const relation = (worker: any) => ({
  workerId: worker.id,
  techniqueId: "",
  worker,
  isActive: true,
  factor1Override: null,
  factor2Override: null,
  productivityOverride: null,
  rateOverride: null,
});
const closeTo = (
  actual: string | null,
  expected: string,
  tolerance = "0.00000000001",
) => {
  assert.ok(actual != null, `expected ${expected}, got null`);
  assert.ok(
    new Decimal(actual!).minus(expected).abs().lte(tolerance),
    `expected ${expected}, got ${actual}`,
  );
};

test("labor rules calculate configured cycles and reject missing factors", () => {
  assert.equal(
    calculateLaborCycles(TechniqueRule.UN_FACTOR, 31, 15).toString(),
    "3",
  );
  assert.equal(
    calculateLaborCycles(TechniqueRule.DOS_FACTORES, 12, 5, 7).toString(),
    "5",
  );
  assert.equal(
    calculateLaborCycles(TechniqueRule.SIMPLE, "2.5").toString(),
    "3",
  );
  assert.throws(
    () => calculateLaborCycles(TechniqueRule.UN_FACTOR, 3),
    /factor válido/,
  );
  assert.throws(
    () => calculateLaborCycles(TechniqueRule.SIMPLE, -1),
    /negativa/,
  );
});

test("shared firing charges tariff times occupancy and exclusive firing charges complete batches, with no kiln multiplier", () => {
  const shared = calculateFiringCost(FiringType.SHARED, "100", "250", "1000");
  assert.equal(shared.occupancy.toString(), "0.25");
  assert.equal(shared.batches.toString(), "1");
  assert.equal(shared.cost.toString(), "25");
  const overCapacity = calculateFiringCost(
    FiringType.SHARED,
    "100",
    "1300",
    "1000",
  );
  assert.equal(overCapacity.occupancy.toString(), "0.65");
  assert.equal(overCapacity.batches.toString(), "2");
  assert.equal(overCapacity.cost.toString(), "130");
  const exclusive = calculateFiringCost(
    FiringType.EXCLUSIVE,
    "100",
    "1001",
    "1000",
  );
  assert.equal(exclusive.batches.toString(), "2");
  assert.equal(exclusive.cost.toString(), "200");
});

test("commercial rounding uses half up", () => {
  assert.equal(roundCommercial("1.225", 2).toFixed(2), "1.23");
});

test("external labor is charged once from worker hourly rate, never from technique or legacy task rates", async () => {
  const worker1 = worker("worker-1", "Trabajador 1", "160");
  const techniques = [
    technique("a", "Técnica A", TechniqueRule.SIMPLE, null, null, "900"),
    technique("b", "Técnica B", TechniqueRule.SIMPLE, null, null, "900"),
    technique("c", "Técnica C", TechniqueRule.SIMPLE, null, null, "900"),
  ];
  const workerTechniques = Object.fromEntries(
    techniques.map((row) => [
      `worker-1:${row.id}`,
      { ...relation(worker1), techniqueId: row.id, rateOverride: new Decimal(800) },
    ]),
  );
  const calc = calculator({
    techniques: Object.fromEntries(techniques.map((row) => [row.id, row])),
    workers: { "worker-1": worker1 },
    workerTechniques,
  });
  const result = await calc.calculate({
    items: [
      {
        name: "Pieza",
        quantity: 1,
        laborTasks: [
          { techniqueId: "a", workerId: "worker-1", quantity: 1, appliedHours: 2, rateOverride: 75 },
          { techniqueId: "b", workerId: "worker-1", quantity: 1, appliedHours: 3 },
          { techniqueId: "c", workerId: "worker-1", quantity: 1, appliedHours: 1 },
        ],
        firings: [],
      },
    ],
  });
  assert.equal(result.status, "READY");
  closeTo(result.lines[0].laborTasks[0].appliedHours, "2");
  assert.equal(result.lines[0].laborTasks[0].cost, null);
  assert.equal(result.lines[0].laborTasks[0].rate, null);
  assert.equal(result.laborWorkers.length, 1);
  closeTo(result.laborWorkers[0].totalHours, "6");
  closeTo(result.laborWorkers[0].hourlyRate, "20");
  closeTo(result.laborWorkers[0].cost, "120");
  closeTo(result.totals.laborCost, "120");
});

test("internal included labor keeps hours visible and adds no commercial labor cost", async () => {
  const internal = { ...worker("worker-internal", "Trabajador interno"), workerType: "INTERNAL", billingMode: "INTERNAL_INCLUDED" };
  const simple = technique("simple", "Trabajo simple", TechniqueRule.SIMPLE, null, null, "999");
  const result = await calculator({
    techniques: { simple },
    workers: { [internal.id]: internal },
    workerTechniques: { [`${internal.id}:simple`]: { ...relation(internal), techniqueId: "simple" } },
  }).calculate({
    items: [{ name: "Pieza", quantity: 1, laborTasks: [{ techniqueId: "simple", workerId: internal.id, quantity: 1, appliedHours: 6 }], firings: [] }],
  });
  assert.equal(result.status, "READY");
  closeTo(result.laborWorkers[0].totalHours, "6");
  closeTo(result.laborWorkers[0].cost, "0");
  closeTo(result.totals.laborCost, "0");
});

test("parallel molds round partial cycles up and keep the configured minutes per cycle", async () => {
  const cases = [
    [20, 2, 60, 10, 600, 10],
    [21, 2, 60, 11, 660, 11],
    [20, 1, 60, 20, 1200, 20],
    [20, 4, 60, 5, 300, 5],
  ] as const;
  for (const [quantity, molds, minutes, cycles, activeMinutes, hours] of cases) {
    const result = await calculator().calculate({
      items: [{ name: "Pieza", quantity, moldCount: molds, productionTimePerCycleMinutes: minutes, laborTasks: [], firings: [] }],
    });
    assert.equal(result.status, "READY");
    closeTo(result.lines[0].productionCycles, String(cycles));
    closeTo(result.lines[0].activeMinutes, String(activeMinutes));
    closeTo(result.lines[0].activeHours, String(hours));
  }
});

test("mold time costs ten external worker-hours but remains included for an internal worker", async () => {
  const molded = technique("molded", "Trabajo con molde", TechniqueRule.SIMPLE, null, null, "900");
  const external = worker("worker-external", "Trabajador externo", "160");
  const internal = { ...worker("worker-internal", "Trabajador interno"), workerType: "INTERNAL", billingMode: "INTERNAL_INCLUDED" };
  const calculateFor = (selected: any) => calculator({
    techniques: { molded },
    workers: { [selected.id]: selected },
    workerTechniques: { [`${selected.id}:molded`]: { ...relation(selected), techniqueId: "molded" } },
  }).calculate({
    items: [{ name: "Pieza", quantity: 20, moldCount: 2, productionTimePerCycleMinutes: 60, laborTasks: [{ techniqueId: "molded", workerId: selected.id, quantity: 20 }], firings: [] }],
  });
  const externalResult = await calculateFor(external);
  const internalResult = await calculateFor(internal);
  closeTo(externalResult.lines[0].activeHours, "10");
  closeTo(externalResult.totals.laborCost, "200");
  closeTo(internalResult.lines[0].activeHours, "10");
  closeTo(internalResult.totals.laborCost, "0");
});

test("V2 workbook parity keeps zero production days at zero and returns its x2/x3 pre-tax reference prices", async () => {
  const result = await calculator().calculate({
    items: [
      {
        name: "Pieza sin mano de obra",
        quantity: 1,
        laborTasks: [],
        firings: [],
      },
    ],
  });
  assert.equal(result.status, "READY");
  closeTo(result.totals.productionDays, "0");
  closeTo(result.totals.technicalCost, "0");
  closeTo(result.totals.otherCosts, "200");
  closeTo(result.totals.subtotal, "200");
  closeTo(result.totals.igvAmount, "36");
  closeTo(result.totals.minimumReferencePrice, "200");
  closeTo(result.totals.recommendedReferencePrice, "200");
});

// Workbook parity: Config!B4:B14, Piezas!N:V, Mano_Obra!Q:S, Cotizador_V2!E8:E15.
test("V2 workbook parity fixture A: one piece with SIMPLE work and no glaze or firing", async () => {
  const worker1 = worker("worker-1", "Trabajador 1");
  const simple = technique(
    "simple",
    "Trabajo simple",
    TechniqueRule.SIMPLE,
    null,
    null,
    "110",
  );
  const workerTechniques = {
    "worker-1:simple": { ...relation(worker1), techniqueId: "simple" },
  };
  const calc = calculator({
    products: { clay: product("clay", "Arcilla Potter", "0.001062") },
    techniques: { simple },
    workers: { "worker-1": worker1 },
    workerTechniques,
  });
  const result = await calc.calculate({
    items: [
      {
        name: "PLATOS HONDOS CHICOS",
        quantity: 1,
        clayWeightG: 500,
        clayProductId: "clay",
        laborTasks: [
          { techniqueId: "simple", workerId: "worker-1", quantity: 1 },
        ],
        firings: [],
      },
    ],
  });
  assert.equal(result.status, "READY");
  closeTo(result.totals.materialCost, "0.531");
  closeTo(result.totals.laborCost, "110");
  closeTo(result.totals.firingCost, "0");
  closeTo(result.totals.technicalCost, "110.531");
  closeTo(result.totals.productionDays, "1");
  closeTo(result.totals.otherCosts, "320");
  closeTo(result.totals.subtotal, "651.593");
  closeTo(result.totals.igvAmount, "117.28674");
  closeTo(result.totals.total, "768.87974");
});
// Workbook parity: per-line material totals, DOS_FACTORES cycles, rate override, overhead, and IGV.
test("V2 workbook parity fixture B: hourly worker billing is grouped across manual tasks", async () => {
  const w1 = worker("worker-1", "Trabajador 1");
  const w2 = worker("worker-2", "Trabajador 2");
  const hand = technique(
    "hand",
    "A mano",
    TechniqueRule.UN_FACTOR,
    "15",
    null,
    "110",
  );
  const dip = technique(
    "dip",
    "Vidriado por inmersión",
    TechniqueRule.UN_FACTOR,
    "50",
    null,
    "110",
  );
  const difficult = technique(
    "difficult",
    "Piezas en torno difícil",
    TechniqueRule.DOS_FACTORES,
    "25",
    "100",
    "180",
  );
  const workerTechniques = {
    "worker-1:hand": { ...relation(w1), techniqueId: "hand" },
    "worker-1:dip": { ...relation(w1), techniqueId: "dip" },
    "worker-2:difficult": {
      ...relation(w2),
      techniqueId: "difficult",
      rateOverride: new Decimal(220), // Legacy value is ignored by hourly worker billing.
    },
  };
  const calc = calculator({
    products: {
      clay: product("clay", "Arcilla Potter", "0.001062"),
      glaze: product("glaze", "BARNIZ BASE 57", "0.00831766365"),
    },
    techniques: { hand, dip, difficult },
    workers: { "worker-1": w1, "worker-2": w2 },
    workerTechniques,
  });
  const result = await calc.calculate({
    items: [
      {
        name: "PLATOS HONDOS CHICOS",
        quantity: 12,
        clayWeightG: 830,
        clayProductId: "clay",
        glazeProductId: "glaze",
        laborTasks: [
          { techniqueId: "hand", workerId: "worker-1", quantity: 12 },
          { techniqueId: "dip", workerId: "worker-1", quantity: 12 },
        ],
        firings: [],
      },
      {
        name: "PIEZA DE TORNO DIFICIL",
        quantity: 7,
        clayWeightG: 400,
        clayProductId: "clay",
        laborTasks: [
          { techniqueId: "difficult", workerId: "worker-2", quantity: 7 },
        ],
        firings: [],
      },
    ],
  });
  assert.equal(result.status, "READY");
  assert.equal(result.lines[0].laborTasks[0].factor1Source, "TECHNIQUE");
  assert.equal(result.lines[0].laborTasks[0].rateSource, "WORKER");
  assert.equal(result.lines[0].laborTasks[0].appliedHoursSource, "CALCULATED");
  assert.equal(result.lines[1].laborTasks[0].factor1Source, "TECHNIQUE");
  assert.equal(result.lines[1].laborTasks[0].factor2Source, "TECHNIQUE");
  assert.equal(result.lines[1].laborTasks[0].rateSource, "WORKER");
  closeTo(result.totals.materialCost, "25.9777094931");
  closeTo(result.totals.laborCost, "440");
  closeTo(result.totals.firingCost, "0");
  closeTo(result.totals.technicalCost, "465.9777094931");
  closeTo(result.totals.productionDays, "4");
  closeTo(result.totals.otherCosts, "680");
  closeTo(result.totals.subtotal, "2077.9331284793");
  closeTo(result.totals.igvAmount, "374.027963126274");
  closeTo(result.totals.total, "2451.9610916055737");
  closeTo(result.totals.unitPrice, "129.0505837687144");
});
test("V2 workbook parity fixture C: master example with both shared firings and no kiln factor", async () => {
  const w1 = worker("worker-1", "Trabajador 1");
  const hand = technique(
    "hand",
    "A mano",
    TechniqueRule.UN_FACTOR,
    "15",
    null,
    "110",
  );
  const dip = technique(
    "dip",
    "Vidriado por inmersión",
    TechniqueRule.UN_FACTOR,
    "50",
    null,
    "110",
  );
  const workerTechniques = {
    "worker-1:hand": { ...relation(w1), techniqueId: "hand" },
    "worker-1:dip": { ...relation(w1), techniqueId: "dip" },
  };
  const calc = calculator({
    products: {
      clay: product("clay", "Arcilla Potter", "0.001062"),
      glaze: product("glaze", "BARNIZ BASE 57", "0.00831766365"),
    },
    techniques: { hand, dip },
    workers: { "worker-1": w1 },
    workerTechniques,
    kilns: {
      large: {
        id: "large",
        name: "Horno grande",
        capacityCm3: new Decimal(200000),
        lowRate: new Decimal(1000),
        highRate: new Decimal(2000),
        isActive: true,
      },
    },
  });
  const result = await calc.calculate({
    items: [
      {
        name: "PLATOS HONDOS CHICOS",
        quantity: 18,
        lengthCm: 15,
        widthCm: 12,
        heightCm: 5,
        clayWeightG: 830,
        clayProductId: "clay",
        glazeProductId: "glaze",
        laborTasks: [
          { techniqueId: "hand", workerId: "worker-1", quantity: 18 },
          { techniqueId: "dip", workerId: "worker-1", quantity: 18 },
        ],
        firings: [
          {
            stage: "LOW",
            enabled: true,
            kilnId: "large",
            firingType: "SHARED",
          },
          {
            stage: "HIGH",
            enabled: true,
            kilnId: "large",
            firingType: "SHARED",
          },
        ],
      },
    ],
  });
  assert.equal(result.status, "READY");
  closeTo(result.totals.materialCost, "34.50616423965");
  closeTo(result.totals.laborCost, "330");
  closeTo(result.totals.firingCost, "583.2");
  closeTo(result.totals.technicalCost, "947.70616423965");
  closeTo(result.totals.productionFactor, "3");
  closeTo(result.totals.productionFactorMin, "2");
  closeTo(result.totals.productionFactorDefault, "3");
  closeTo(result.totals.productionDays, "3");
  closeTo(result.totals.otherCosts, "560");
  closeTo(result.totals.subtotal, "3403.1184927189497");
  closeTo(result.totals.igvAmount, "612.561328689411");
  closeTo(result.totals.total, "4015.6798214083606");
  closeTo(result.totals.unitPrice, "223.0933234115756");
  closeTo(result.totals.minimumReferencePrice, "2455.4123284793");
  closeTo(result.totals.recommendedReferencePrice, "3403.1184927189497");
  closeTo(result.lines[0].geometricVolumeCm3, "16200");
  closeTo(result.lines[0].operationalVolumeCm3, "38880");
  closeTo(result.lines[0].volumeCm3, "38880");
  closeTo(result.totals.geometricVolumeCm3, "16200");
  closeTo(result.totals.operationalVolumeCm3, "38880");
});

test("optional commercial rounding raises the pre-tax price to the configured step; NONE keeps fixture A untouched", async () => {
  const worker1 = worker("worker-1", "Trabajador 1");
  const simple = technique(
    "simple",
    "Trabajo simple",
    TechniqueRule.SIMPLE,
    null,
    null,
    "110",
  );
  const input = {
    items: [
      {
        name: "PLATOS HONDOS CHICOS",
        quantity: 1,
        clayWeightG: 500,
        clayProductId: "clay",
        laborTasks: [
          { techniqueId: "simple", workerId: "worker-1", quantity: 1 },
        ],
        firings: [],
      },
    ],
  };
  const build = (priceRounding?: string) => {
    const calc = calculator({
      products: { clay: product("clay", "Arcilla Potter", "0.001062") },
      techniques: { simple },
      workers: { "worker-1": worker1 },
      workerTechniques: {
        "worker-1:simple": { ...relation(worker1), techniqueId: "simple" },
      },
    });
    (calc as any).prisma.commercialSettings.findUnique = async () => ({
      ...settings,
      ...(priceRounding ? { priceRounding } : {}),
    });
    return calc;
  };
  const plain = await build().calculate(input);
  closeTo(plain.totals.subtotal, "651.593");
  closeTo(plain.totals.roundingAdjustment, "0");
  const rounded = await build("UP_10").calculate(input);
  closeTo(rounded.totals.subtotalBeforeRounding, "651.593");
  closeTo(rounded.totals.subtotal, "660");
  closeTo(rounded.totals.roundingAdjustment, "8.407");
  closeTo(rounded.totals.igvAmount, "118.8");
  closeTo(rounded.totals.total, "778.8");
});
