import test from "node:test";
import assert from "node:assert/strict";
import { AssistantService } from "../src/assistant/assistant.service";
import { DeterministicAssistantProvider } from "../src/assistant/assistant.provider";
import { RecommendationService } from "../src/assistant/recommendation.service";
import {
  confidenceForCases,
  firingSimilarity,
  quotationSimilarity,
  summarizeCheaperKilnCases,
  type FiringCase,
} from "../src/assistant/recommendation-engine";

const user = (role: "ADMIN" | "OPERARIO" = "OPERARIO") => ({
  id: "user-1",
  email: "test@example.local",
  displayName: "Tester",
  role,
});

test("step help uses the explicit Cotizador page context and a local provider", async () => {
  let interaction: any;
  let query: any;
  const prisma: any = {
    assistantKnowledgeEntry: {
      findMany: async ({ where }: any) => {
        query = where;
        return [{
          id: "kb-1", slug: "cotizador-moldes", title: "Moldes", content: "Ciclos = CEIL(cantidad / moldes).",
          tags: ["molde", "ciclo"], module: "Cotizador", step: "PRODUCTO", version: 2, status: "PUBLISHED", adminOnly: false,
        }];
      },
    },
    assistantInteraction: {
      create: async ({ data }: any) => { interaction = data; return { id: "interaction-1", ...data }; },
    },
  };
  const service = new AssistantService(prisma, { calculate: async () => { throw new Error("unused"); } } as any, new DeterministicAssistantProvider());
  const result = await service.ask({
    context: { route: "/cotizador", module: "Cotizador", step: "PRODUCTO" },
    question: "¿Cómo funcionan los moldes?",
  }, user());
  assert.equal(result.resolved, true);
  assert.match(result.answer, /CEIL\(cantidad \/ moldes\)/);
  assert.match(result.answer, /PRODUCTO/);
  assert.equal(query.adminOnly, false);
  assert.equal(interaction.route, "/cotizador");
  assert.equal(interaction.step, "PRODUCTO");
});

test("assistant does not expose price or worker cost details to OPERARIO", async () => {
  let interaction: any;
  let calculations = 0;
  const prisma: any = {
    assistantKnowledgeEntry: { findMany: async () => [] },
    assistantInteraction: { create: async ({ data }: any) => { interaction = data; return { id: "interaction-2", ...data }; } },
  };
  const service = new AssistantService(prisma, { calculate: async () => { calculations++; return {}; } } as any, new DeterministicAssistantProvider());
  const result = await service.ask({
    context: { route: "/cotizador", module: "Cotizador", step: "PRICE" },
    question: "¿Por qué cuesta esto?",
    currentInput: { items: [{ quantity: 2, laborTasks: [], firings: [] }] } as any,
  }, user("OPERARIO"));
  assert.match(result.answer, /no tiene permiso/i);
  assert.equal(calculations, 0);
  assert.equal(interaction.costSensitive, false);
});

test("ADMIN can ask for a backend cost breakdown and the response is marked private", async () => {
  let interaction: any;
  const prisma: any = {
    assistantKnowledgeEntry: { findMany: async () => [] },
    assistantInteraction: { create: async ({ data }: any) => { interaction = data; return { id: "interaction-3", ...data }; } },
  };
  const calculator = { calculate: async () => ({ status: "READY", totals: {
    materialCost: "12", laborCost: "20", firingCost: "3", otherCosts: "8", technicalCost: "35",
    productionFactor: "3", igvAmount: "6.3", total: "49.3",
  } }) };
  const service = new AssistantService(prisma, calculator as any, new DeterministicAssistantProvider());
  const result = await service.ask({
    context: { route: "/cotizador", module: "Cotizador", step: "PRICE" },
    question: "¿Cuál es el desglose de costos?",
    currentInput: { items: [{ quantity: 2, laborTasks: [], firings: [] }] } as any,
  }, user("ADMIN"));
  assert.match(result.answer, /mano de obra S\/ 20/);
  assert.match(result.answer, /total S\/ 49.3/);
  assert.equal(interaction.costSensitive, true);
});

test("a non-helpful rating reopens an interaction and only its owner can rate it", async () => {
  let resolved: boolean | undefined;
  const prisma: any = {
    assistantInteraction: {
      findUnique: async () => ({ id: "interaction-4", userId: "user-1" }),
      update: async ({ data }: any) => { resolved = data.resolved; return data; },
    },
    assistantFeedback: { upsert: async ({ create }: any) => create },
  };
  const service = new AssistantService(prisma, {} as any, new DeterministicAssistantProvider());
  const result = await service.feedback({ interactionId: "interaction-4", helpful: false, reason: "Faltó explicar el ciclo" }, user());
  assert.equal(result.helpful, false);
  assert.equal(resolved, false);
  prisma.assistantInteraction.findUnique = async () => ({ id: "interaction-4", userId: "someone-else" });
  await assert.rejects(service.feedback({ interactionId: "interaction-4", helpful: true }, user()), /propias interacciones/);
});

test("ADMIN review publishes a new private knowledge version; suggestions stay supervised", async () => {
  let createdKnowledge: any;
  let reviewed: any;
  const prisma: any = {
    assistantKnowledgeSuggestion: {
      findUnique: async () => ({ id: "suggest-1", question: "¿Cómo registrar un horno?", proposedAnswer: null, module: "Hornos", step: null, route: "/hornos", status: "PENDING" }),
      update: async ({ data }: any) => (reviewed = data),
    },
    assistantKnowledgeEntry: {
      findFirst: async () => ({ version: 2 }),
      updateMany: async () => ({ count: 1 }),
      create: async ({ data }: any) => (createdKnowledge = { id: "kb-3", ...data }),
    },
  };
  const service = new AssistantService(prisma, {} as any, new DeterministicAssistantProvider());
  await service.reviewSuggestion("suggest-1", {
    decision: "APPROVE", proposedAnswer: "Registra capacidad y tarifas aprobadas.", adminOnly: true,
  } as any, user("ADMIN"));
  assert.equal(createdKnowledge.version, 3);
  assert.equal(createdKnowledge.status, "PUBLISHED");
  assert.equal(createdKnowledge.adminOnly, true);
  assert.equal(reviewed.status, "APPROVED");
  assert.equal(reviewed.knowledgeEntryId, "kb-3");
});

test("recorded quotation outcomes keep estimated and real values separate and omit customer data", async () => {
  let saved: any;
  const decimal = (value: number) => ({ toNumber: () => value });
  const prisma: any = {
    quotation: { findUnique: async () => ({
      id: "quote-1", status: "CONFIRMED", total: decimal(300), productionDays: decimal(2),
      inputSnapshot: { input: { items: [{ productId: "piece-1", quantity: 2, moldCount: 2, lengthCm: 10, widthCm: 8, heightCm: 6 }] }, calculation: { lines: [{ activeHours: "8" }] }, customerName: "PRIVATE CUSTOMER" },
      items: [{
        quantity: decimal(2), product: { productType: "FINISHED_PRODUCT" },
        materials: [{ productId: "clay-1", productName: "Arcilla", materialType: "CLAY" }],
        laborTasks: [{ workerId: "worker-1", techniqueId: "tech-1", appliedHours: decimal(8) }],
        firings: [{ stage: "LOW", firingType: "SHARED", kilnId: "kiln-1", kilnName: "Horno chico", volumeCm3: decimal(12000), capacityCm3: decimal(18000), cost: decimal(80) }],
      }],
    }) },
    quotationOutcome: { create: async ({ data }: any) => (saved = data) },
  };
  const service = new AssistantService(prisma, {} as any, new DeterministicAssistantProvider());
  await service.createQuotationOutcome({ quotationId: "quote-1", finalCost: 320, actualTime: 3, resultQuality: "GOOD" } as any, user("ADMIN"));
  assert.equal(saved.estimatedCost, 300);
  assert.equal(saved.finalCost, 320);
  assert.equal(saved.estimatedTime, 2);
  assert.equal(saved.actualTime, 3);
  assert.deepEqual(saved.productTypes, ["FINISHED_PRODUCT"]);
  assert.deepEqual(saved.workers, [{ workerId: "worker-1", techniqueIds: ["tech-1"], activeHours: 8 }]);
  assert.equal(JSON.stringify(saved).includes("PRIVATE CUSTOMER"), false);
});

test("firing outcomes store actual cost, estimated cost and occupancy separately", async () => {
  let saved: any;
  const prisma: any = {
    kiln: { findUnique: async () => ({ id: "kiln-1", isActive: true }) },
    firingOutcome: { create: async ({ data }: any) => (saved = data) },
  };
  const service = new AssistantService(prisma, {} as any, new DeterministicAssistantProvider());
  await service.createFiringOutcome({
    kilnId: "kiln-1", firingType: "SHARED", volumeCm3: 12000, capacityCm3: 18000,
    quantity: 20, productTypes: ["FINISHED_PRODUCT"], materials: ["clay-red"], estimatedCost: 100, realCost: 90,
  } as any, user("ADMIN"));
  assert.equal(saved.occupancyRatio, 12000 / 18000);
  assert.equal(saved.estimatedCost, 100);
  assert.equal(saved.realCost, 90);
});

test("assistant history redacts previously private cost answers after role changes", async () => {
  const prisma: any = {
    assistantInteraction: { findMany: async () => [{ id: "private", costSensitive: true, answer: "Salario: S/ 100", feedback: null }] },
  };
  const service = new AssistantService(prisma, {} as any, new DeterministicAssistantProvider());
  const [entry] = await service.history(user("OPERARIO"));
  assert.match(entry.answer, /importes reservados/i);
});

test("similarity scores compare product, quantity, dimensions and materials deterministically", () => {
  const target = { quantity: 20, productTypes: ["FINISHED_PRODUCT"], dimensions: { lengthCm: 10, widthCm: 8, heightCm: 6 }, materials: ["clay-red"], moldCount: 2 };
  const same = quotationSimilarity(target, {
    id: "q1", ...target, finalCost: 100, estimatedCost: 95, actualTime: 10, estimatedTime: 10,
  });
  const different = quotationSimilarity(target, {
    id: "q2", quantity: 80, productTypes: ["SERVICE"], dimensions: { lengthCm: 20, widthCm: 20, heightCm: 20 },
    materials: ["clay-white"], moldCount: 1, finalCost: 100, estimatedCost: 95, actualTime: 10, estimatedTime: 10,
  });
  assert.equal(same, 1);
  assert.ok(different < 0.5);
});

test("firing similarity requires the same shared or exclusive mode", () => {
  const caseRecord = { id: "f1", kilnId: "small", kilnName: "Chico", firingType: "SHARED", volumeCm3: 14000, capacityCm3: 18000, realCost: 75, estimatedCost: 80, damagedPieces: 0 };
  assert.ok(firingSimilarity({ firingType: "SHARED", volumeCm3: 15000, capacityCm3: 18000 }, caseRecord) > 0.9);
  assert.equal(firingSimilarity({ firingType: "EXCLUSIVE", volumeCm3: 15000, capacityCm3: 18000 }, caseRecord), 0);
});

test("10 real firing outcomes show eight lower-cost smaller-kiln cases with high confidence", () => {
  const cases: FiringCase[] = Array.from({ length: 10 }, (_, index) => {
    const smaller = index < 8;
    return {
      id: `f-${index}`,
      kilnId: smaller ? "small" : "large",
      kilnName: smaller ? "Horno chico" : "Horno grande",
      firingType: "SHARED",
      volumeCm3: 12000 + index * 100,
      capacityCm3: smaller ? 16000 : 30000,
      realCost: smaller ? 80 : 150,
      estimatedCost: smaller ? 90 : 140,
      damagedPieces: 0,
    };
  });
  const summary = summarizeCheaperKilnCases(cases);
  assert.equal(summary.compared.length, 10);
  assert.equal(summary.cheaper.length, 8);
  assert.equal(summary.consistency, 0.8);
  assert.equal(summary.confidence, "HIGH");
  assert.equal(confidenceForCases(10, 0.9, 0.8), "HIGH");
});

const quotationInput = (overrides: any = {}) => ({
  items: [{
    name: "Taza", quantity: 20, moldCount: 1, productionTimePerCycleMinutes: 60,
    lengthCm: 10, widthCm: 8, heightCm: 6, laborTasks: [],
    firings: [{ stage: "LOW", enabled: true, firingType: "SHARED", kilnId: "kiln-1" }],
    ...overrides,
  }],
});

function mockCalculator() {
  return {
    calculate: async (input: any) => {
      const item = input.items[0];
      const cycles = Math.ceil(Number(item.quantity) / Number(item.moldCount ?? 1));
      const activeHours = cycles * Number(item.productionTimePerCycleMinutes ?? 60) / 60;
      const firingCost = (item.firings ?? []).filter((row: any) => row.enabled).length * 10;
      return {
        status: "READY",
        totals: { total: String(activeHours * 10 + firingCost), productionDays: String(activeHours / 8), materialCost: "0", laborCost: String(activeHours * 10), firingCost: String(firingCost), otherCosts: "0" },
        lines: [{ activeHours: String(activeHours), firings: item.firings.map((row: any) => ({ ...row, volumeCm3: "12000", capacityCm3: "18000", cost: row.enabled ? "10" : "0" })) }],
      };
    },
  };
}

test("ADMIN recommendations compare a compatible INTERNAL_INCLUDED worker without claiming availability", async () => {
  const events: any[] = [];
  const prisma: any = {
    worker: { findMany: async () => [{
      id: "internal-1", name: "Taller interno", workerType: "INTERNAL", billingMode: "INTERNAL_INCLUDED", isActive: true,
      techniques: [{ techniqueId: "hand" }],
    }] },
    recommendationEvent: { create: async ({ data }: any) => { const event = { id: `worker-rec-${events.length + 1}`, ...data }; events.push(event); return event; } },
    recommendationResult: { findMany: async () => [] },
    quotationOutcome: { findMany: async () => [] },
    firingOutcome: { findMany: async () => [] },
  };
  const calculator = {
    calculate: async (input: any) => {
      const internal = input.items[0].laborTasks[0].workerId === "internal-1";
      return {
        status: "READY",
        totals: { total: internal ? "240" : "300", productionDays: internal ? "1" : "2", materialCost: "40", laborCost: internal ? "0" : "60", firingCost: "20", otherCosts: "50" },
        lines: [{ activeHours: "10", laborWorkers: [{
          workerId: internal ? "internal-1" : "external-1",
          workerName: internal ? "Taller interno" : "Taller externo",
          workerType: internal ? "INTERNAL" : "EXTERNAL",
          billingMode: internal ? "INTERNAL_INCLUDED" : "HOURLY",
          totalHours: internal ? "8" : "10",
          cost: internal ? "0" : "60",
        }], firings: [] }],
      };
    },
  };
  const service = new RecommendationService(prisma, calculator as any);
  const result = await service.recommendations({
    current: { items: [{ name: "Taza", quantity: 20, laborTasks: [{ techniqueId: "hand", workerId: "external-1" }], firings: [] }] } as any,
    entityId: "draft-1",
  } as any, user("ADMIN"));

  const recommendation = result.recommendations.find((row: any) => row.type === "REPLACE_WORKER");
  assert.ok(recommendation);
  assert.equal(recommendation.current_cost, 300);
  assert.equal(recommendation.suggested_cost, 240);
  assert.equal(recommendation.estimated_saving, 60);
  assert.equal(recommendation.time_impact.changeHours, -2);
  assert.equal(recommendation.can_apply, false);
  assert.match(recommendation.blocking_reason, /disponibilidad/i);
  assert.equal(recommendation.scenario.workerAvailabilityConfirmed, false);
  assert.match(recommendation.explanation, /INTERNAL_INCLUDED/);
  assert.equal(events.length, 1);
});

test("replacing a worker requires explicit availability confirmation before a simulation can be applied", async () => {
  const events: any[] = [];
  const prisma: any = {
    worker: { findUnique: async () => ({ id: "internal-1", isActive: true, techniques: [{ techniqueId: "hand" }] }) },
    recommendationEvent: { create: async ({ data }: any) => { const event = { id: `worker-sim-${events.length + 1}`, ...data }; events.push(event); return event; } },
  };
  const service = new RecommendationService(prisma, mockCalculator() as any);
  const current = quotationInput({ laborTasks: [{ techniqueId: "hand", workerId: "external-1", quantity: 20 }] });
  const blocked = await service.simulate({
    current,
    scenario: { type: "REPLACE_WORKER", itemIndex: 0, workerId: "internal-1", workerAvailabilityConfirmed: false } as any,
  } as any, user("ADMIN"));
  assert.equal(blocked.canApply, false);
  assert.match(blocked.blockingReason ?? "", /disponibilidad/i);

  const confirmed = await service.simulate({
    current,
    scenario: { type: "REPLACE_WORKER", itemIndex: 0, workerId: "internal-1", workerAvailabilityConfirmed: true } as any,
  } as any, user("ADMIN"));
  assert.equal(confirmed.canApply, true);
  assert.equal(confirmed.persistsQuotationChanges, false);
  assert.equal(events.length, 2);
});

test("what-if simulation does not persist quotation changes and requires compatibility confirmation", async () => {
  let event: any;
  let quotationWrites = 0;
  const prisma: any = {
    recommendationEvent: { create: async ({ data }: any) => (event = { id: "sim-1", ...data }) },
    quotation: { update: async () => { quotationWrites++; } },
  };
  const service = new RecommendationService(prisma, mockCalculator() as any);
  const result = await service.simulate({
    current: quotationInput(),
    scenario: { type: "MORE_MOLDS", itemIndex: 0, moldCount: 2, availableMoldCount: 2, moldCompatibilityConfirmed: false } as any,
  } as any, user("ADMIN"));
  assert.equal(result.persistsQuotationChanges, false);
  assert.equal(result.canApply, false);
  assert.match(result.blockingReason ?? "", /compatible/i);
  assert.equal(result.currentCost, 210);
  assert.equal(result.simulatedCost, 110);
  assert.equal(event.scenario.input.items[0].moldCount, 2);
  assert.equal(quotationWrites, 0);
});

test("removing the high firing with glaze has savings information but can_apply remains false", async () => {
  let event: any;
  const prisma: any = { recommendationEvent: { create: async ({ data }: any) => (event = { id: "blocked-sim", ...data }) } };
  const service = new RecommendationService(prisma, mockCalculator() as any);
  const result = await service.simulate({
    current: quotationInput({ glazeProductId: "glaze-1", firings: [
      { stage: "LOW", enabled: true, firingType: "SHARED", kilnId: "kiln-1" },
      { stage: "HIGH", enabled: true, firingType: "SHARED", kilnId: "kiln-1" },
    ] }),
    scenario: { type: "REMOVE_HIGH_FIRING", itemIndex: 0, explicitClientApproval: true } as any,
  } as any, user("ADMIN"));
  assert.equal(result.canApply, false);
  assert.match(result.blockingReason ?? "", /esmalte/i);
  assert.equal(result.estimatedSaving, 10);
  assert.equal(event.scenario.canApply, false);
  assert.equal(event.scenario.input.items[0].firings[1].enabled, false);
});

test("changing kiln requires compatibility and explicit client and workshop approval", async () => {
  const events: any[] = [];
  const prisma: any = {
    kiln: { findUnique: async () => ({ id: "alternate-kiln", isActive: true }) },
    recommendationEvent: { create: async ({ data }: any) => { const event = { id: `kiln-sim-${events.length + 1}`, ...data }; events.push(event); return event; } },
    quotation: { update: async () => { throw new Error("simulation must not persist a quotation"); } },
  };
  const service = new RecommendationService(prisma, mockCalculator() as any);
  const current = quotationInput({ firings: [{ stage: "LOW", enabled: true, firingType: "SHARED", kilnId: "current-kiln" }] });
  const simulate = (firingCompatibilityConfirmed: boolean, explicitClientApproval: boolean) => service.simulate({
    current,
    scenario: { type: "REPLACE_KILN", itemIndex: 0, kilnId: "alternate-kiln", firingCompatibilityConfirmed, explicitClientApproval } as any,
  } as any, user("ADMIN"));

  const compatibilityMissing = await simulate(false, false);
  assert.equal(compatibilityMissing.canApply, false);
  assert.match(compatibilityMissing.blockingReason ?? "", /compatibilidad/i);

  const approvalMissing = await simulate(true, false);
  assert.equal(approvalMissing.canApply, false);
  assert.match(approvalMissing.blockingReason ?? "", /aprobación explícita/i);

  const confirmed = await simulate(true, true);
  assert.equal(confirmed.canApply, true);
  assert.equal(confirmed.persistsQuotationChanges, false);
  assert.equal((confirmed.scenarioInput as any).items[0].firings[0].kilnId, "alternate-kiln");
  assert.equal(events.length, 3);
});

test("only an explicit apply action returns a draft to the editor", async () => {
  let updated: any;
  const input = quotationInput({ moldCount: 2 });
  const prisma: any = {
    recommendationEvent: {
      findUnique: async () => ({ id: "sim-apply", userId: "user-1", scenario: { canApply: true, input } }),
      update: async ({ data }: any) => (updated = data),
    },
  };
  const service = new RecommendationService(prisma, mockCalculator() as any);
  const result = await service.applyExplicitly("sim-apply", user("ADMIN"));
  assert.equal(result.applied, true);
  assert.equal(result.quotationPersisted, false);
  assert.equal((result.input as any).items[0].moldCount, 2);
  assert.equal(updated.accepted, true);
  assert.ok(updated.appliedAt instanceof Date);
});

test("optional techniques are suggested only for configured optional work and require client approval", async () => {
  const events: any[] = [];
  const prisma: any = {
    productTechnique: {
      findMany: async ({ where }: any) => {
        assert.equal(where.isRequired, false);
        return [{ productId: "product-1", techniqueId: "illustration", isRequired: false, technique: { name: "Con ilustración" } }];
      },
      findUnique: async () => ({ isRequired: false }),
    },
    worker: { findMany: async () => [] },
    product: { findMany: async () => [{ id: "product-1", productType: "FINISHED_PRODUCT" }] },
    quotationOutcome: { findMany: async () => [] },
    firingOutcome: { findMany: async () => [] },
    recommendationResult: { findMany: async () => [] },
    recommendationEvent: {
      create: async ({ data }: any) => {
        const event = { id: `optional-technique-${events.length + 1}`, ...data };
        events.push(event);
        return event;
      },
    },
  };
  const calculator = {
    calculate: async (input: any) => {
      const included = input.items[0].laborTasks.some((task: any) => task.techniqueId === "illustration");
      const laborCost = included ? 60 : 0;
      return {
        status: "READY",
        totals: { total: included ? "300" : "240", productionDays: "1", materialCost: "40", laborCost: String(laborCost), firingCost: "20", otherCosts: "180" },
        lines: [{ activeHours: "8", laborWorkers: [{ totalHours: included ? "6" : "0", cost: String(laborCost) }], firings: [] }],
      };
    },
  };
  const service = new RecommendationService(prisma, calculator as any);
  const current = { items: [{
    productId: "product-1", name: "Vaso ilustrado", quantity: 20,
    laborTasks: [{ techniqueId: "illustration", workerId: "worker-1" }], firings: [],
  }] };

  const result = await service.recommendations({ current: current as any, entityId: "draft-1" } as any, user("ADMIN"));
  const recommendation = result.recommendations.find((row: any) => row.type === "REMOVE_OPTIONAL_TECHNIQUE");
  assert.ok(recommendation);
  assert.equal(recommendation.estimated_saving, 60);
  assert.equal(recommendation.can_apply, false);
  assert.match(recommendation.blocking_reason, /aprobación.*cliente/i);
  assert.equal(recommendation.scenario.explicitClientApproval, false);
  assert.match(recommendation.quality_impact, /acabado|presentación/i);

  const blocked = await service.simulate({
    current,
    scenario: recommendation.scenario,
  } as any, user("ADMIN"));
  assert.equal(blocked.canApply, false);
  assert.match(blocked.blockingReason ?? "", /aprobación.*cliente/i);

  const approved = await service.simulate({
    current,
    scenario: { ...recommendation.scenario, explicitClientApproval: true },
  } as any, user("ADMIN"));
  assert.equal(approved.canApply, true);
  assert.equal(approved.persistsQuotationChanges, false);
  assert.equal((approved.scenarioInput as any).items[0].laborTasks.length, 0);
  assert.equal(events.length, 3);
});

test("same-kiln exclusive firings can be simulated together only after technical, schedule and client confirmations", async () => {
  const events: any[] = [];
  const prisma: any = {
    worker: { findMany: async () => [] },
    firingOutcome: { findMany: async () => [] },
    quotationOutcome: { findMany: async () => [] },
    recommendationResult: { findMany: async () => [] },
    recommendationEvent: {
      create: async ({ data }: any) => {
        const event = { id: `consolidate-${events.length + 1}`, ...data };
        events.push(event);
        return event;
      },
    },
  };
  const calculator = {
    calculate: async (input: any) => {
      const shared = input.items.every((item: any) => item.firings[0].firingType === "SHARED");
      const firingCost = shared ? 50 : 100;
      return {
        status: "READY",
        totals: { total: String(200 + firingCost), productionDays: "1", materialCost: "50", laborCost: "50", firingCost: String(firingCost), otherCosts: "100" },
        lines: input.items.map((item: any) => ({
          activeHours: "8",
          laborWorkers: [],
          firings: item.firings.map((firing: any) => ({ ...firing, volumeCm3: "6000", capacityCm3: "17000", cost: shared ? "25" : "50" })),
        })),
      };
    },
  };
  const service = new RecommendationService(prisma, calculator as any);
  const current = { items: ["Taza", "Plato"].map((name) => ({
    name, quantity: 2, laborTasks: [],
    firings: [{ stage: "LOW", enabled: true, firingType: "EXCLUSIVE", kilnId: "kiln-1" }],
  })) };
  const result = await service.recommendations({ current: current as any, entityId: "draft-1" } as any, user("ADMIN"));
  const recommendation = result.recommendations.find((row: any) => row.type === "CONSOLIDATE_FIRINGS");
  assert.ok(recommendation);
  assert.equal(recommendation.estimated_saving, 50);
  assert.equal(recommendation.can_apply, false);
  assert.deepEqual(recommendation.scenario.itemIndices, [0, 1]);

  const blocked = await service.simulate({ current, scenario: recommendation.scenario } as any, user("ADMIN"));
  assert.equal(blocked.canApply, false);
  assert.match(blocked.blockingReason ?? "", /compatibilidad técnica/i);
  assert.equal((blocked.scenarioInput as any).items[0].firings[0].firingType, "SHARED");

  const confirmed = await service.simulate({
    current,
    scenario: {
      ...recommendation.scenario,
      firingCompatibilityConfirmed: true,
      firingScheduleConfirmed: true,
      explicitClientApproval: true,
    },
  } as any, user("ADMIN"));
  assert.equal(confirmed.canApply, true);
  assert.equal(confirmed.persistsQuotationChanges, false);
  assert.equal((confirmed.scenarioInput as any).items[1].firings[0].firingType, "SHARED");
  assert.equal(events.length, 3);
});
