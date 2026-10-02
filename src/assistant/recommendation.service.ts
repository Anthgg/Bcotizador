import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfidenceLevel } from "../generated/prisma/enums";
import { PrismaService } from "../common/prisma.service";
import { CalculatorService } from "../calculator/calculator.service";
import { AuthUser } from "../common/auth.guards";
import {
  AssistantRecommendationsDto,
  AssistantScenarioDto,
  AssistantSimulationDto,
  RecommendationDecisionDto,
} from "./assistant.dto";
import {
  asNumber,
  confidenceForCases,
  firingSimilarity,
  quotationSimilarity,
} from "./recommendation-engine";

const num = (value: unknown) => asNumber(value) ?? 0;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const confidenceLabel = (value: "HIGH" | "MEDIUM" | "LOW") => value as ConfidenceLevel;

@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: CalculatorService,
  ) {}

  private async saveEvent(args: {
    userId: string;
    type: string;
    entityId?: string;
    estimatedSaving?: number | null;
    sourceCases?: unknown[];
    confidence?: "HIGH" | "MEDIUM" | "LOW";
    scenario?: unknown;
  }) {
    return this.prisma.recommendationEvent.create({
      data: {
        recommendationType: args.type,
        entityType: "QUOTATION_DRAFT",
        entityId: args.entityId ?? null,
        estimatedSaving: args.estimatedSaving ?? null,
        sourceCases: (args.sourceCases ?? []) as any,
        confidence: confidenceLabel(args.confidence ?? "LOW"),
        scenario: args.scenario as any,
        userId: args.userId,
      },
    });
  }

  private costFields(current: any, simulated: any, canSeeCosts: boolean) {
    const currentCost = current.totals.total == null ? null : num(current.totals.total);
    const suggestedCost = simulated.totals.total == null ? null : num(simulated.totals.total);
    const saving = currentCost != null && suggestedCost != null ? currentCost - suggestedCost : null;
    return {
      currentCost: canSeeCosts ? currentCost : null,
      suggestedCost: canSeeCosts ? suggestedCost : null,
      estimatedSaving: canSeeCosts ? saving : null,
    };
  }

  private activeHours(result: any) {
    return (result.lines ?? []).reduce((sum: number, line: any) => sum + num(line.activeHours), 0);
  }

  private async learnedConfidence(type: string, baseline: "HIGH" | "MEDIUM" | "LOW") {
    const rows = await this.prisma.recommendationResult.findMany({
      where: { recommendation: { recommendationType: type } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { estimatedSaving: true, realSaving: true },
    });
    const measured = rows.filter((row) => row.estimatedSaving != null && row.realSaving != null);
    if (measured.length < 5)
      return { confidence: baseline, caseCount: measured.length, consistency: null as number | null };
    const consistent = measured.filter((row) => {
      const estimated = row.estimatedSaving!.toNumber();
      const actual = row.realSaving!.toNumber();
      return Math.abs(estimated - actual) / Math.max(Math.abs(estimated), 1) <= 0.2;
    }).length;
    const consistency = consistent / measured.length;
    return {
      confidence: confidenceForCases(measured.length, 1, consistency),
      caseCount: measured.length,
      consistency,
    };
  }

  private outputRecommendation(input: {
    eventId: string;
    type: string;
    title: string;
    explanation: string;
    currentValue: unknown;
    suggestedValue: unknown;
    currentCost: number | null;
    suggestedCost: number | null;
    estimatedSaving: number | null;
    timeImpact: unknown;
    qualityImpact: string;
    operationalImpact: string;
    confidence: string;
    sourceCases: unknown[];
    canApply: boolean;
    blockingReason?: string | null;
    scenario?: unknown;
  }) {
    return {
      id: input.eventId,
      type: input.type,
      title: input.title,
      explanation: input.explanation,
      current_value: input.currentValue,
      suggested_value: input.suggestedValue,
      current_cost: input.currentCost,
      suggested_cost: input.suggestedCost,
      estimated_saving: input.estimatedSaving,
      time_impact: input.timeImpact,
      quality_impact: input.qualityImpact,
      operational_impact: input.operationalImpact,
      confidence: input.confidence,
      source_cases: input.sourceCases,
      can_apply: input.canApply,
      blocking_reason: input.blockingReason ?? null,
      ...(input.scenario ? { scenario: input.scenario } : {}),
    };
  }

  async recommendations(input: AssistantRecommendationsDto, user: AuthUser) {
    const currentInput: any = input.current;
    const current = await this.calculator.calculate(currentInput);
    const canSeeCosts = user.role === "ADMIN";
    const items: any[] = currentInput.items ?? [];
    const recommendations: any[] = [];
    const availableMolds = input.availableMoldCount ?? 0;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const present = Math.max(1, Number(item.moldCount ?? 1));
      if (availableMolds <= present) continue;
      const proposed = Math.min(availableMolds, present + 1);
      const simulatedInput = clone(currentInput);
      simulatedInput.items[itemIndex].moldCount = proposed;
      const simulated = await this.calculator.calculate(simulatedInput);
      const amounts = this.costFields(current, simulated, canSeeCosts);
      const currentHours = num(current.lines?.[itemIndex]?.activeHours);
      const simulatedHours = num(simulated.lines?.[itemIndex]?.activeHours);
      const compatible = input.moldCompatibilityConfirmed === true;
      const canApply = compatible && current.status === "READY" && simulated.status === "READY";
      const learning = await this.learnedConfidence("MORE_MOLDS", "HIGH");
      const blockingReason = compatible
        ? canApply ? null : "El cálculo tiene costos incompletos y requiere revisión antes de aplicar."
        : "Confirma que el molde adicional es compatible con las dimensiones y el acabado solicitados.";
      const event = await this.saveEvent({
        userId: user.id,
        type: "MORE_MOLDS",
        entityId: input.entityId,
        estimatedSaving: amounts.estimatedSaving,
        confidence: learning.confidence,
        scenario: {
          input: simulatedInput,
          canApply,
          blockingReason,
          scenario: { type: "MORE_MOLDS", itemIndex, moldCount: proposed, availableMoldCount: availableMolds, moldCompatibilityConfirmed: compatible },
        },
      });
      recommendations.push(this.outputRecommendation({
        eventId: event.id,
        type: "MORE_MOLDS",
        title: `Evaluar ${proposed} moldes para ${item.name ?? "la pieza"}`,
        explanation: `La regla determinística calcula ciclos = CEIL(${num(item.quantity)} / ${present}) con el molde actual y CEIL(${num(item.quantity)} / ${proposed}) con ${proposed} moldes. El tiempo puede bajar; el costo solo baja si disminuyen horas pagadas a trabajadores HOURLY.`,
        currentValue: { moldCount: present, activeHours: currentHours },
        suggestedValue: { moldCount: proposed, activeHours: simulatedHours },
        currentCost: amounts.currentCost,
        suggestedCost: amounts.suggestedCost,
        estimatedSaving: amounts.estimatedSaving,
        timeImpact: { currentHours, suggestedHours: simulatedHours, changeHours: simulatedHours - currentHours },
        qualityImpact: "No cambia la pieza solicitada si el molde es compatible; verifica dimensiones y acabado.",
        operationalImpact: compatible ? "Se indicó que el molde está disponible; confirma compatibilidad antes de aplicar." : "Requiere confirmar disponibilidad y compatibilidad del molde.",
        confidence: learning.confidence,
        sourceCases: [{ source: "REGLA_DETERMINISTICA", formula: "CEIL(cantidad / moldCount) × tiempoPorCiclo" }, ...(learning.caseCount >= 5 ? [{ source: "RESULTADOS_REALES_DE_RECOMENDACIONES", caseCount: learning.caseCount, estimateWithinTwentyPercent: learning.consistency }] : [])],
        canApply,
        blockingReason,
        scenario: { type: "MORE_MOLDS", itemIndex, moldCount: proposed, availableMoldCount: availableMolds, moldCompatibilityConfirmed: compatible },
      }));
    }

    const workerRecommendations = await this.workerRecommendations(currentInput, current, user, input.entityId);
    recommendations.push(...workerRecommendations);
    const optionalTechniqueRecommendations = await this.optionalTechniqueRecommendations(currentInput, current, user, input.entityId);
    recommendations.push(...optionalTechniqueRecommendations);
    const quoteCases = await this.quotationCases(currentInput, user);
    if (quoteCases) recommendations.push(quoteCases);
    const firingCases = await this.firingRecommendations(currentInput, current, user, input.entityId);
    recommendations.push(...firingCases);
    const consolidationRecommendations = await this.firingConsolidationRecommendations(currentInput, current, user, input.entityId);
    recommendations.push(...consolidationRecommendations);
    return { recommendations, current: this.publicComparison(current, canSeeCosts) };
  }

  private async workerRecommendations(input: any, current: any, user: AuthUser, entityId?: string) {
    if (user.role !== "ADMIN") return [];
    const items: any[] = input.items ?? [];
    const techniquesByItem = items.map((item) => [...new Set<string>(
      (item.laborTasks ?? [])
        .map((task: any) => task.techniqueId)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
    )]);
    const requiredTechniques = [...new Set(techniquesByItem.flat())];
    if (!requiredTechniques.length) return [];

    const workers = await this.prisma.worker.findMany({
      where: {
        isActive: true,
        techniques: { some: { isActive: true, techniqueId: { in: requiredTechniques } } },
      },
      include: { techniques: { where: { isActive: true }, select: { techniqueId: true } } },
      orderBy: { name: "asc" },
      take: 100,
    });
    const proposals: any[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const tasks: any[] = item.laborTasks ?? [];
      const techniques = techniquesByItem[itemIndex];
      if (!tasks.length || !techniques.length) continue;
      const currentLine = current.lines?.[itemIndex];
      const currentHours = (currentLine?.laborWorkers ?? []).reduce(
        (sum: number, worker: any) => sum + num(worker.totalHours), 0,
      );
      const assignedIds = new Set(tasks.map((task) => task.workerId).filter(Boolean));
      const candidates = workers.filter((worker) => {
        const availableTechniques = new Set(worker.techniques.map((relation) => relation.techniqueId));
        return techniques.every((techniqueId) => availableTechniques.has(techniqueId)) && !assignedIds.has(worker.id);
      });

      for (const worker of candidates) {
        const simulatedInput = clone(input);
        for (const task of simulatedInput.items[itemIndex].laborTasks ?? []) task.workerId = worker.id;
        let simulated: any;
        try {
          simulated = await this.calculator.calculate(simulatedInput);
        } catch {
          continue;
        }
        if (current.status !== "READY" || simulated.status !== "READY") continue;
        const amounts = this.costFields(current, simulated, true);
        if (amounts.currentCost == null || amounts.suggestedCost == null || (amounts.estimatedSaving ?? 0) <= 0) continue;
        const simulatedLine = simulated.lines?.[itemIndex];
        const simulatedHours = (simulatedLine?.laborWorkers ?? []).reduce(
          (sum: number, row: any) => sum + num(row.totalHours), 0,
        );
        const billingMode = worker.billingMode ?? (worker.workerType === "EXTERNAL" ? "HOURLY" : "INTERNAL_INCLUDED");
        proposals.push({
          worker,
          itemIndex,
          itemName: item.name ?? "la pieza",
          simulatedInput,
          currentLine,
          simulatedLine,
          currentHours,
          simulatedHours,
          amounts,
          billingMode,
        });
      }
    }

    proposals.sort((left, right) => right.amounts.estimatedSaving - left.amounts.estimatedSaving);
    const output: any[] = [];
    for (const proposal of proposals.slice(0, 3)) {
      const { worker, itemIndex, itemName, simulatedInput, currentLine, simulatedLine, currentHours, simulatedHours, amounts, billingMode } = proposal;
      const learning = await this.learnedConfidence("REPLACE_WORKER", "MEDIUM");
      const availabilityReason = "Confirma la disponibilidad del trabajador y la fecha antes de aplicar el cambio.";
      const scenario = { type: "REPLACE_WORKER", itemIndex, workerId: worker.id, workerAvailabilityConfirmed: false };
      const event = await this.saveEvent({
        userId: user.id,
        type: "REPLACE_WORKER",
        entityId,
        estimatedSaving: amounts.estimatedSaving,
        confidence: learning.confidence,
        sourceCases: [{ source: "CALCULADORA_DETERMINISTICA", basis: "Tarifa, modalidad, técnicas habilitadas y horas recalculadas" }],
        scenario: { input: simulatedInput, canApply: false, blockingReason: availabilityReason, scenario },
      });
      const currentWorkers = (currentLine?.laborWorkers ?? []).map((row: any) => ({
        workerId: row.workerId,
        name: row.workerName,
        billingMode: row.billingMode,
        hours: num(row.totalHours),
        cost: row.cost == null ? null : num(row.cost),
      }));
      const suggestedWorkerCost = (simulatedLine?.laborWorkers ?? [])
        .filter((row: any) => row.workerId === worker.id)
        .reduce((sum: number, row: any) => sum + (row.cost == null ? 0 : num(row.cost)), 0);
      const modeText = billingMode === "INTERNAL_INCLUDED"
        ? "Su modalidad INTERNAL_INCLUDED mantiene en cero el costo comercial adicional de mano de obra."
        : "Su modalidad HOURLY calcula el costo con la tarifa horaria y las horas recalculadas.";
      output.push(this.outputRecommendation({
        eventId: event.id,
        type: "REPLACE_WORKER",
        title: `Evaluar a ${worker.name} para ${itemName}`,
        explanation: `${worker.name} tiene vínculos activos para las técnicas de esta línea. ${modeText} El ahorro y el tiempo provienen de volver a calcular el borrador completo con los datos actuales.`,
        currentValue: { workers: currentWorkers, activeHours: currentHours },
        suggestedValue: { workerId: worker.id, workerName: worker.name, workerType: worker.workerType, billingMode, activeHours: simulatedHours, laborCost: suggestedWorkerCost },
        currentCost: amounts.currentCost,
        suggestedCost: amounts.suggestedCost,
        estimatedSaving: amounts.estimatedSaving,
        timeImpact: { currentHours, suggestedHours: simulatedHours, changeHours: simulatedHours - currentHours },
        qualityImpact: "Las técnicas de la línea se conservan y el trabajador tiene vínculos activos para realizarlas; valida el acabado si cambian productividad o factores.",
        operationalImpact: "El sistema no lleva agenda de disponibilidad. Confirma trabajador y fecha antes de aplicar.",
        confidence: learning.confidence,
        sourceCases: [{ source: "CALCULADORA_DETERMINISTICA", basis: "Tarifa, modalidad, técnicas habilitadas y horas recalculadas" }, ...(learning.caseCount >= 5 ? [{ source: "RESULTADOS_REALES_DE_RECOMENDACIONES", caseCount: learning.caseCount, estimateWithinTwentyPercent: learning.consistency }] : [])],
        canApply: false,
        blockingReason: availabilityReason,
        scenario,
      }));
    }
    return output;
  }

  private publicComparison(result: any, canSeeCosts: boolean) {
    return {
      status: result.status,
      total: canSeeCosts ? result.totals.total : null,
      productionDays: result.totals.productionDays,
      activeHours: this.activeHours(result),
      materialCost: canSeeCosts ? result.totals.materialCost : null,
      laborCost: canSeeCosts ? result.totals.laborCost : null,
      firingCost: canSeeCosts ? result.totals.firingCost : null,
      otherCosts: canSeeCosts ? result.totals.otherCosts : null,
    };
  }

  private async optionalTechniqueRecommendations(input: any, current: any, user: AuthUser, entityId?: string) {
    if (user.role !== "ADMIN") return [];
    const items: any[] = input.items ?? [];
    const proposals: any[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const taskIds = [...new Set<string>((item.laborTasks ?? [])
        .map((task: any) => task.techniqueId)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0))];
      if (!item.productId || !taskIds.length) continue;
      const optionalTechniques = await this.prisma.productTechnique.findMany({
        where: { productId: item.productId, isRequired: false, techniqueId: { in: taskIds } },
        include: { technique: { select: { name: true } } },
      });
      for (const relation of optionalTechniques) {
        const removedCount = (item.laborTasks ?? []).filter((task: any) => task.techniqueId === relation.techniqueId).length;
        if (!removedCount) continue;
        const simulatedInput = clone(input);
        simulatedInput.items[itemIndex].laborTasks = (simulatedInput.items[itemIndex].laborTasks ?? [])
          .filter((task: any) => task.techniqueId !== relation.techniqueId);
        let simulated: any;
        try {
          simulated = await this.calculator.calculate(simulatedInput);
        } catch {
          continue;
        }
        if (current.status !== "READY" || simulated.status !== "READY") continue;
        const amounts = this.costFields(current, simulated, true);
        if ((amounts.estimatedSaving ?? 0) <= 0) continue;
        const learning = await this.learnedConfidence("REMOVE_OPTIONAL_TECHNIQUE", "MEDIUM");
        const techniqueName = relation.technique?.name ?? "técnica opcional";
        const currentLine = current.lines?.[itemIndex];
        const simulatedLine = simulated.lines?.[itemIndex];
        const laborHours = (line: any) => (line?.laborWorkers ?? [])
          .reduce((sum: number, row: any) => sum + num(row.totalHours), 0);
        const currentHours = laborHours(currentLine);
        const simulatedHours = laborHours(simulatedLine);
        const blockingReason = "Quitar esta técnica cambia el producto solicitado y requiere aprobación comercial y del cliente.";
        const scenario = {
          type: "REMOVE_OPTIONAL_TECHNIQUE",
          itemIndex,
          techniqueId: relation.techniqueId,
          explicitClientApproval: false,
        };
        const event = await this.saveEvent({
          userId: user.id,
          type: "REMOVE_OPTIONAL_TECHNIQUE",
          entityId,
          estimatedSaving: amounts.estimatedSaving,
          confidence: learning.confidence,
          sourceCases: [
            { source: "CONFIGURACION_PRODUCTO", techniqueId: relation.techniqueId, isRequired: false },
            { source: "CALCULADORA_DETERMINISTICA", basis: "Se recalculó el borrador quitando solo las tareas de esta técnica" },
          ],
          scenario: { input: simulatedInput, canApply: false, blockingReason, scenario },
        });
        proposals.push(this.outputRecommendation({
          eventId: event.id,
          type: "REMOVE_OPTIONAL_TECHNIQUE",
          title: `Evaluar quitar ${techniqueName} de ${item.name ?? "la pieza"}`,
          explanation: `El catálogo marca ${techniqueName} como opcional para este producto. La simulación quita ${removedCount} tarea(s) de mano de obra y vuelve a calcular el borrador; no altera una cotización guardada.`,
          currentValue: { techniqueId: relation.techniqueId, techniqueName, taskCount: removedCount },
          suggestedValue: { techniqueId: relation.techniqueId, techniqueName, removed: true },
          currentCost: amounts.currentCost,
          suggestedCost: amounts.suggestedCost,
          estimatedSaving: amounts.estimatedSaving,
          timeImpact: { currentHours, suggestedHours: simulatedHours, changeHours: simulatedHours - currentHours },
          qualityImpact: `Cambiaría el acabado o la presentación solicitada al omitir ${techniqueName}.`,
          operationalImpact: "Requiere aprobación comercial y del cliente antes de aplicar el cambio al borrador.",
          confidence: learning.confidence,
          sourceCases: [
            { source: "CONFIGURACION_PRODUCTO", techniqueId: relation.techniqueId, isRequired: false },
            { source: "CALCULADORA_DETERMINISTICA", basis: "Costo y horas se recalcularon con las tareas restantes" },
            ...(learning.caseCount >= 5 ? [{ source: "RESULTADOS_REALES_DE_RECOMENDACIONES", caseCount: learning.caseCount, estimateWithinTwentyPercent: learning.consistency }] : []),
          ],
          canApply: false,
          blockingReason,
          scenario,
        }));
      }
    }
    return proposals.sort((left, right) => (right.estimated_saving ?? 0) - (left.estimated_saving ?? 0)).slice(0, 3);
  }

  private async quotationCases(currentInput: any, user: AuthUser) {
    const productIds: string[] = [...new Set<string>((currentInput.items ?? [])
      .map((item: any) => item.productId)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0))];
    const products = productIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, productType: true } })
      : [];
    const productTypes = [...new Set(products.map((product) => product.productType))];
    const targetQuantity = (currentInput.items ?? []).reduce((sum: number, item: any) => sum + num(item.quantity), 0);
    const targetMaterials = [...new Set((currentInput.items ?? []).flatMap((item: any) => [item.clayProductId, item.glazeProductId].filter(Boolean)))];
    const targetDimensions = (currentInput.items ?? []).map((item: any) => ({ lengthCm: item.lengthCm, widthCm: item.widthCm, heightCm: item.heightCm }));
    const targetMolds = Math.max(1, ...(currentInput.items ?? []).map((item: any) => Number(item.moldCount ?? 1)));
    const target = { quantity: targetQuantity, productTypes, materials: targetMaterials, dimensions: targetDimensions, moldCount: targetMolds };
    const rows = await this.prisma.quotationOutcome.findMany({ orderBy: { outcomeDate: "desc" }, take: 200 });
    const matches = rows
      .map((row) => ({ row, score: quotationSimilarity(target, {
        id: row.id,
        quantity: row.quantity.toNumber(),
        productTypes: row.productTypes,
        dimensions: row.dimensions,
        materials: row.materials,
        moldCount: row.moldCount,
        finalCost: row.finalCost?.toNumber() ?? null,
        estimatedCost: row.estimatedCost?.toNumber() ?? null,
        actualTime: row.actualTime?.toNumber() ?? null,
        estimatedTime: row.estimatedTime?.toNumber() ?? null,
      }) }))
      .filter((match) => match.score >= 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    if (!matches.length) return null;
    const consistent = matches.filter(({ row }) => {
      const estimate = row.estimatedCost?.toNumber();
      const actual = row.finalCost?.toNumber();
      return estimate != null && actual != null && estimate > 0 && Math.abs(estimate - actual) / estimate <= 0.2;
    }).length;
    const completed = matches.filter(({ row }) => row.finalCost != null).length;
    const confidence = confidenceForCases(matches.length, matches.reduce((sum, item) => sum + item.score, 0) / matches.length, completed ? consistent / completed : 0.5);
    const userCanSeeCosts = user.role === "ADMIN";
    const sourceCases = matches.map(({ row, score }) => ({
      outcomeId: row.id,
      similarity: score,
      quantity: row.quantity.toNumber(),
      estimatedCost: userCanSeeCosts ? row.estimatedCost?.toNumber() ?? null : null,
      finalCost: userCanSeeCosts ? row.finalCost?.toNumber() ?? null : null,
      estimatedTime: row.estimatedTime?.toNumber() ?? null,
      actualTime: row.actualTime?.toNumber() ?? null,
      resultQuality: row.resultQuality,
    }));
    return this.outputRecommendation({
      eventId: (await this.saveEvent({
        userId: user.id,
        type: "HISTORICAL_QUOTATION_CASES",
        confidence,
        sourceCases,
        scenario: { canApply: false, blockingReason: "Los casos son referencias históricas; no cambian la cotización." },
      })).id,
      type: "HISTORICAL_QUOTATION_CASES",
      title: "Cotizaciones históricas similares",
      explanation: `${matches.length} casos tienen similitud determinística de al menos 55%. Los resultados estimados y reales se muestran por separado; la coincidencia describe casos parecidos y no demuestra causalidad.`,
      currentValue: { quantity: targetQuantity, moldCount: targetMolds, materials: targetMaterials },
      suggestedValue: { caseCount: matches.length, cases: sourceCases },
      currentCost: null,
      suggestedCost: null,
      estimatedSaving: null,
      timeImpact: { source: "Los tiempos estimados y reales permanecen separados." },
      qualityImpact: "Los resultados de calidad solo aparecen si fueron registrados.",
      operationalImpact: "Usa los casos para comparar el proceso; el sistema no copia valores históricos a esta cotización.",
      confidence,
      sourceCases,
      canApply: false,
      blockingReason: "Los casos son informativos y no modifican automáticamente la cotización.",
    });
  }

  private async firingConsolidationRecommendations(input: any, current: any, user: AuthUser, entityId?: string) {
    if (user.role !== "ADMIN") return [];
    const groups = new Map<string, { stage: "LOW" | "HIGH"; kilnId: string; itemIndices: number[] }>();
    for (let itemIndex = 0; itemIndex < (input.items ?? []).length; itemIndex++) {
      for (const firing of input.items[itemIndex].firings ?? []) {
        if (!firing.enabled || firing.firingType !== "EXCLUSIVE" || !firing.kilnId) continue;
        const stage = firing.stage as "LOW" | "HIGH";
        const key = `${stage}:${firing.kilnId}`;
        const group: { stage: "LOW" | "HIGH"; kilnId: string; itemIndices: number[] } =
          groups.get(key) ?? { stage, kilnId: firing.kilnId, itemIndices: [] };
        group.itemIndices.push(itemIndex);
        groups.set(key, group);
      }
    }

    const output: any[] = [];
    for (const group of groups.values()) {
      const itemIndices = [...new Set(group.itemIndices)].sort((a, b) => a - b);
      if (itemIndices.length < 2) continue;
      const simulatedInput = clone(input);
      let valid = true;
      for (const itemIndex of itemIndices) {
        const firing = (simulatedInput.items[itemIndex]?.firings ?? []).find((row: any) =>
          row.enabled && row.stage === group.stage && row.kilnId === group.kilnId && row.firingType === "EXCLUSIVE",
        );
        if (!firing) { valid = false; break; }
        firing.firingType = "SHARED";
      }
      if (!valid) continue;

      let simulated: any;
      try {
        simulated = await this.calculator.calculate(simulatedInput);
      } catch {
        continue;
      }
      if (current.status !== "READY" || simulated.status !== "READY") continue;
      const amounts = this.costFields(current, simulated, true);
      if ((amounts.estimatedSaving ?? 0) <= 0) continue;
      const learning = await this.learnedConfidence("CONSOLIDATE_FIRINGS", "LOW");
      const stageLabel = group.stage === "LOW" ? "primera" : "segunda";
      const names = itemIndices.map((index) => input.items[index].name ?? `línea ${index + 1}`);
      const blockingReason = "Confirma compatibilidad de piezas y esmaltes, disponibilidad en la misma fecha y aprobación del cliente antes de aplicar.";
      const scenario = {
        type: "CONSOLIDATE_FIRINGS",
        itemIndices,
        stage: group.stage,
        kilnId: group.kilnId,
        firingCompatibilityConfirmed: false,
        firingScheduleConfirmed: false,
        explicitClientApproval: false,
      };
      const event = await this.saveEvent({
        userId: user.id,
        type: "CONSOLIDATE_FIRINGS",
        entityId,
        estimatedSaving: amounts.estimatedSaving,
        confidence: learning.confidence,
        sourceCases: [{ source: "CALCULADORA_DETERMINISTICA", basis: "Se recalcularon todas las líneas con el mismo horno y etapa en modo compartido" }],
        scenario: { input: simulatedInput, canApply: false, blockingReason, scenario },
      });
      const currentFiringCost = itemIndices.reduce((sum, itemIndex) => {
        const row = current.lines?.[itemIndex]?.firings?.find((firing: any) => firing.stage === group.stage && firing.kilnId === group.kilnId);
        return sum + (row?.cost == null ? 0 : num(row.cost));
      }, 0);
      const simulatedFiringCost = itemIndices.reduce((sum, itemIndex) => {
        const row = simulated.lines?.[itemIndex]?.firings?.find((firing: any) => firing.stage === group.stage && firing.kilnId === group.kilnId);
        return sum + (row?.cost == null ? 0 : num(row.cost));
      }, 0);
      output.push(this.outputRecommendation({
        eventId: event.id,
        type: "CONSOLIDATE_FIRINGS",
        title: `Evaluar consolidar la ${stageLabel} quema de ${itemIndices.length} líneas`,
        explanation: `Las líneas ${names.join(", ")} usan el mismo horno y etapa. La simulación vuelve a calcularlas como una carga compartida; el resultado es una estimación del modelo, no una confirmación de compatibilidad ni de agenda.`,
        currentValue: { firingType: "EXCLUSIVE", stage: group.stage, kilnId: group.kilnId, itemIndices, firingCost: currentFiringCost },
        suggestedValue: { firingType: "SHARED", stage: group.stage, kilnId: group.kilnId, itemIndices, firingCost: simulatedFiringCost },
        currentCost: amounts.currentCost,
        suggestedCost: amounts.suggestedCost,
        estimatedSaving: amounts.estimatedSaving,
        timeImpact: { statement: "El cálculo no estima menor duración; confirma la agenda de la hornada con el taller." },
        qualityImpact: "Cocer juntas piezas o esmaltes incompatibles puede cambiar el acabado o dañar productos; requiere validación técnica.",
        operationalImpact: "Requiere confirmar que las líneas comparten fecha y carga, y aprobación explícita del cliente.",
        confidence: learning.confidence,
        sourceCases: [{ source: "CALCULADORA_DETERMINISTICA", basis: "Costo recalculado por línea con la tarifa y ocupación del horno" }, ...(learning.caseCount >= 5 ? [{ source: "RESULTADOS_REALES_DE_RECOMENDACIONES", caseCount: learning.caseCount, estimateWithinTwentyPercent: learning.consistency }] : [])],
        canApply: false,
        blockingReason,
        scenario,
      }));
    }
    return output;
  }

  private async firingRecommendations(input: any, current: any, user: AuthUser, entityId?: string) {
    if (user.role !== "ADMIN") return [];
    const historical = await this.prisma.firingOutcome.findMany({
      where: { realCost: { not: null } },
      orderBy: { outcomeDate: "desc" },
      take: 300,
    });
    const output: any[] = [];
    for (let itemIndex = 0; itemIndex < (input.items ?? []).length; itemIndex++) {
      const calcItem = current.lines?.[itemIndex];
      for (const firing of (calcItem?.firings ?? []).filter((row: any) => row.enabled)) {
        if (firing.cost == null) continue;
        const target = { firingType: firing.firingType, volumeCm3: num(firing.volumeCm3), capacityCm3: num(firing.capacityCm3) };
        const cases = historical.map((row) => ({
          row,
          score: firingSimilarity(target, {
            id: row.id,
            kilnId: row.kilnId,
            kilnName: row.kilnName,
            firingType: row.firingType,
            volumeCm3: row.volumeCm3.toNumber(),
            capacityCm3: row.capacityCm3.toNumber(),
            realCost: row.realCost?.toNumber() ?? null,
            estimatedCost: row.estimatedCost?.toNumber() ?? null,
            damagedPieces: row.damagedPieces,
          }),
        })).filter((entry) => entry.score >= 0.65);
        const groups = new Map<string, { kilnId: string | null; kilnName: string | null; costs: number[]; cases: typeof cases }>();
        for (const entry of cases) {
          const key = entry.row.kilnId ?? entry.row.kilnName ?? "unknown";
          const group = groups.get(key) ?? { kilnId: entry.row.kilnId, kilnName: entry.row.kilnName, costs: [], cases: [] };
          const cost = entry.row.realCost?.toNumber();
          if (cost != null && entry.row.volumeCm3.gt(0)) group.costs.push(cost / entry.row.volumeCm3.toNumber());
          group.cases.push(entry);
          groups.set(key, group);
        }
        const currentGroup = [...groups.values()].find((group) => group.kilnId && group.kilnId === firing.kilnId);
        if (!currentGroup || currentGroup.costs.length < 3) continue;
        const currentRate = currentGroup.costs.reduce((sum, rate) => sum + rate, 0) / currentGroup.costs.length;
        const alternatives = [...groups.values()]
          .filter((group) => group.kilnId && group.kilnId !== firing.kilnId && group.costs.length >= 3)
          .map((group) => ({ ...group, averageRate: group.costs.reduce((sum, rate) => sum + rate, 0) / group.costs.length }))
          .filter((group) => group.averageRate < currentRate)
          .sort((a, b) => a.averageRate - b.averageRate);
        const best = alternatives[0];
        if (!best) continue;
        const consistency = best.costs.filter((rate) => rate < currentRate).length / best.costs.length;
        const avgSimilarity = best.cases.reduce((sum, entry) => sum + entry.score, 0) / best.cases.length;
        const confidence = confidenceForCases(best.cases.length, avgSimilarity, consistency);
        const learning = await this.learnedConfidence("FIRING_HISTORY", confidence);
        const sourceCases = best.cases.slice(0, 10).map(({ row, score }) => ({
          outcomeId: row.id,
          kilnName: row.kilnName,
          firingType: row.firingType,
          volumeCm3: row.volumeCm3.toNumber(),
          realCost: row.realCost?.toNumber() ?? null,
          estimatedCost: row.estimatedCost?.toNumber() ?? null,
          similarity: score,
          damagedPieces: row.damagedPieces,
        }));
        const currentFiringCost = num(firing.cost);
        const estimate = currentRate > 0 && target.volumeCm3 > 0 ? currentFiringCost * (1 - best.averageRate / currentRate) : null;
        const event = await this.saveEvent({
          userId: user.id,
          type: "FIRING_HISTORY",
          entityId,
          estimatedSaving: estimate,
          sourceCases,
          confidence: learning.confidence,
          scenario: { canApply: false, blockingReason: "La compatibilidad, disponibilidad y agenda del otro horno requieren validación operativa." },
        });
        output.push(this.outputRecommendation({
          eventId: event.id,
          type: "FIRING_HISTORY",
          title: `Comparar el horno ${best.kilnName ?? "alternativo"}`,
          explanation: `En ${best.cases.length} quemas históricas similares del mismo tipo, el horno alternativo tuvo menor costo real promedio por cm³ que el horno actual. Es una asociación histórica, no una garantía de costo ni de resultado.`,
          currentValue: { kilnId: firing.kilnId, kilnName: firing.kilnName, historicalRealCostPerCm3: currentRate },
          suggestedValue: { kilnId: best.kilnId, kilnName: best.kilnName, historicalRealCostPerCm3: best.averageRate },
          currentCost: currentFiringCost,
          suggestedCost: estimate == null ? null : currentFiringCost - estimate,
          estimatedSaving: estimate,
          timeImpact: { statement: "El tiempo de quema y la agenda deben confirmarse con el taller." },
          qualityImpact: "El cambio de horno puede afectar el resultado; requiere validación técnica y del cliente.",
          operationalImpact: "Confirma compatibilidad de curva, disponibilidad y plazo antes de simular o aplicar.",
          confidence: learning.confidence,
          sourceCases,
          canApply: false,
          blockingReason: "La compatibilidad, disponibilidad y agenda del horno alternativo no están verificadas.",
          scenario: { type: "REPLACE_KILN", itemIndex, kilnId: best.kilnId, firingCompatibilityConfirmed: false, explicitClientApproval: false },
        }));
      }
    }
    return output;
  }

  private async transformScenario(current: any, scenario: AssistantScenarioDto) {
    const next = clone(current);
    const items: any[] = next.items ?? [];
    const index = scenario.itemIndex ?? 0;
    const item = items[index];
    if (!item) throw new BadRequestException("La línea indicada no existe");
    let canApply = true;
    let blockingReason: string | null = null;
    let consequence = "El escenario debe revisarse antes de cambiar el borrador.";

    if (scenario.type === "MORE_MOLDS") {
      const existing = Math.max(1, Number(item.moldCount ?? 1));
      if (!scenario.moldCount || scenario.moldCount <= existing)
        throw new BadRequestException("El escenario debe aumentar la cantidad de moldes");
      if (!scenario.availableMoldCount || scenario.moldCount > scenario.availableMoldCount) {
        canApply = false;
        blockingReason = "No se confirmó que haya suficientes moldes disponibles.";
      }
      if (scenario.moldCompatibilityConfirmed !== true) {
        canApply = false;
        blockingReason = "Confirma que el molde adicional es compatible con la pieza y su acabado.";
      }
      item.moldCount = scenario.moldCount;
      consequence = `Cambian ciclos y tiempo con CEIL(cantidad / ${scenario.moldCount}). El costo solo baja si disminuyen horas cobradas a trabajadores HOURLY; INTERNAL_INCLUDED conserva costo adicional cero.`;
    } else if (scenario.type === "REPLACE_WORKER") {
      if (!scenario.workerId) throw new BadRequestException("Selecciona el trabajador de reemplazo");
      if (scenario.workerAvailabilityConfirmed !== true) {
        canApply = false;
        blockingReason = "Confirma la disponibilidad del trabajador y la fecha antes de aplicar el cambio.";
      }
      const targetItems = scenario.itemIndex == null ? items : [item];
      const tasks = targetItems.flatMap((row) => row.laborTasks ?? []);
      const techniques = [...new Set(tasks.map((task: any) => task.techniqueId).filter(Boolean))];
      const worker = await this.prisma.worker.findUnique({
        where: { id: scenario.workerId },
        include: { techniques: { where: { isActive: true }, select: { techniqueId: true } } },
      });
      if (!worker?.isActive) {
        canApply = false;
        blockingReason = "El trabajador no está activo.";
      } else {
        const allowed = new Set(worker.techniques.map((relation) => relation.techniqueId));
        if (techniques.some((techniqueId) => !allowed.has(techniqueId))) {
          canApply = false;
          blockingReason = "El trabajador no tiene habilitadas todas las técnicas de estas líneas.";
        }
      }
      if (canApply) for (const target of targetItems) for (const task of target.laborTasks ?? []) task.workerId = scenario.workerId;
      consequence = "Cambia la asignación de mano de obra. Se recalculan horas y costo según modalidad y productividad del trabajador.";
    } else if (scenario.type === "REPLACE_KILN") {
      if (!scenario.kilnId) throw new BadRequestException("Selecciona el horno alternativo");
      const kiln = await this.prisma.kiln.findUnique({ where: { id: scenario.kilnId } });
      if (!kiln?.isActive) {
        canApply = false;
        blockingReason = "El horno alternativo no está activo.";
      }
      if (scenario.firingCompatibilityConfirmed !== true) {
        canApply = false;
        blockingReason = "Confirma que la curva y capacidad del horno son compatibles con la pieza.";
      }
      if (scenario.explicitClientApproval !== true) {
        canApply = false;
        blockingReason = scenario.firingCompatibilityConfirmed === true
          ? "Cambiar el horno requiere aprobación explícita del cliente y del taller."
          : "Confirma compatibilidad del horno y aprobación explícita del cliente y del taller.";
      }
      const targetItems = scenario.itemIndex == null ? items : [item];
      for (const target of targetItems) {
        for (const firing of target.firings ?? []) if (firing.enabled) firing.kilnId = scenario.kilnId;
      }
      consequence = "Mantiene las etapas seleccionadas y vuelve a calcular capacidad, hornadas y costo. El horno puede cambiar curva, acabado y plazo; requiere aprobación del cliente.";
    } else if (scenario.type === "CONSOLIDATE_FIRINGS") {
      const itemIndices = scenario.itemIndices ?? [];
      if (itemIndices.length < 2 || new Set(itemIndices).size !== itemIndices.length || !scenario.kilnId || !scenario.stage) {
        throw new BadRequestException("Selecciona al menos dos líneas con el mismo horno y etapa para consolidar");
      }
      for (const itemIndex of itemIndices) {
        const target = items[itemIndex];
        if (!target) throw new BadRequestException("Una de las líneas para consolidar no existe");
        const firing = (target.firings ?? []).find((row: any) =>
          row.enabled && row.stage === scenario.stage && row.kilnId === scenario.kilnId && row.firingType === "EXCLUSIVE",
        );
        if (!firing) throw new BadRequestException("Cada línea debe tener activa la misma etapa exclusiva en el mismo horno");
        firing.firingType = "SHARED";
      }
      if (scenario.firingCompatibilityConfirmed !== true) {
        canApply = false;
        blockingReason = "Confirma compatibilidad técnica de las piezas y esmaltes antes de compartir la hornada.";
      }
      if (scenario.firingScheduleConfirmed !== true) {
        canApply = false;
        blockingReason ??= "Confirma que el taller puede programar todas las líneas en la misma hornada.";
      }
      if (scenario.explicitClientApproval !== true) {
        canApply = false;
        blockingReason ??= "Consolidar la hornada requiere aprobación explícita del cliente.";
      }
      consequence = "Recalcula la etapa seleccionada como una carga compartida. Compatibilidad, agenda y aprobación del cliente deben confirmarse antes de aplicar.";
    } else if (scenario.type === "REMOVE_HIGH_FIRING") {
      const targetItems = scenario.itemIndex == null ? items : [item];
      const hasGlaze = targetItems.some((row) => Boolean(row.glazeProductId) || num(row.glazeWeightG) > 0 || num(row.glazePct) > 0);
      if (hasGlaze) {
        canApply = false;
        blockingReason = "La pieza tiene esmalte configurado. La segunda quema es necesaria para completar el acabado seleccionado.";
      }
      if (scenario.explicitClientApproval !== true) {
        canApply = false;
        blockingReason ??= "Quitar una etapa cambia el acabado y requiere aprobación explícita.";
      }
      for (const target of targetItems) for (const firing of target.firings ?? []) if (firing.stage === "HIGH") firing.enabled = false;
      consequence = hasGlaze
        ? "La simulación muestra el ahorro potencial, pero dejaría incompleto el acabado esmaltado."
        : "Elimina la etapa de alta temperatura; el acabado y la calidad pueden cambiar y requieren validación del cliente.";
    } else if (scenario.type === "REMOVE_OPTIONAL_TECHNIQUE") {
      if (!scenario.techniqueId) throw new BadRequestException("Selecciona la técnica que quieres simular");
      const targetItems = scenario.itemIndex == null ? items : [item];
      for (const target of targetItems) {
        const tasks = (target.laborTasks ?? []).filter((task: any) => task.techniqueId === scenario.techniqueId);
        if (!tasks.length) continue;
        if (!target.productId) {
          canApply = false;
          blockingReason = "No se puede verificar si la técnica es obligatoria para una pieza personalizada.";
          continue;
        }
        const relation = await this.prisma.productTechnique.findUnique({
          where: { productId_techniqueId: { productId: target.productId, techniqueId: scenario.techniqueId } },
        });
        if (!relation || relation.isRequired) {
          canApply = false;
          blockingReason = "La técnica es obligatoria o no hay una configuración que confirme que sea opcional.";
        }
        target.laborTasks = (target.laborTasks ?? []).filter((task: any) => task.techniqueId !== scenario.techniqueId);
      }
      if (scenario.explicitClientApproval !== true) {
        canApply = false;
        blockingReason ??= "Quitar una técnica cambia el producto solicitado y requiere aprobación comercial del cliente.";
      }
      consequence = "Reduce tiempo y costo estimados, pero cambia el producto solicitado; requiere aprobación comercial y del cliente.";
    }
    return { input: next, canApply, blockingReason, consequence };
  }

  async simulate(input: AssistantSimulationDto, user: AuthUser) {
    const currentInput: any = input.current;
    const transformed = await this.transformScenario(currentInput, input.scenario);
    const current = await this.calculator.calculate(currentInput);
    const simulated = await this.calculator.calculate(transformed.input);
    if (current.status !== "READY" || simulated.status !== "READY") {
      transformed.canApply = false;
      transformed.blockingReason ??= "El costo está incompleto; resuelve los componentes pendientes antes de aplicar.";
    }
    const mayViewCosts = user.role === "ADMIN";
    const amounts = this.costFields(current, simulated, mayViewCosts);
    const time = {
      currentHours: this.activeHours(current),
      simulatedHours: this.activeHours(simulated),
      changeHours: this.activeHours(simulated) - this.activeHours(current),
      currentProductionDays: current.totals.productionDays,
      simulatedProductionDays: simulated.totals.productionDays,
    };
    const event = await this.saveEvent({
      userId: user.id,
      type: input.scenario.type,
      entityId: input.entityId,
      estimatedSaving: amounts.estimatedSaving,
      sourceCases: [],
      confidence: "LOW",
      scenario: {
        input: transformed.input,
        scenario: input.scenario,
        canApply: transformed.canApply,
        blockingReason: transformed.blockingReason,
      },
    });
    return {
      simulationId: event.id,
      persistsQuotationChanges: false,
      canApply: transformed.canApply,
      blockingReason: transformed.blockingReason,
      explanation: transformed.consequence,
      current: this.publicComparison(current, mayViewCosts),
      simulated: this.publicComparison(simulated, mayViewCosts),
      currentCost: amounts.currentCost,
      simulatedCost: amounts.suggestedCost,
      estimatedSaving: amounts.estimatedSaving,
      timeImpact: time,
      scenarioInput: transformed.input,
    };
  }

  async applyExplicitly(id: string, user: AuthUser) {
    const event = await this.prisma.recommendationEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Simulación no encontrada");
    if (event.userId !== user.id) throw new ForbiddenException("La simulación pertenece a otro usuario");
    const scenario = event.scenario as any;
    if (!scenario?.canApply) throw new ConflictException(scenario?.blockingReason ?? "La simulación no se puede aplicar");
    if (!scenario?.input || !Array.isArray(scenario.input.items))
      throw new ConflictException("La simulación no contiene un borrador aplicable");
    await this.prisma.recommendationEvent.update({
      where: { id },
      data: { accepted: true, appliedAt: new Date() },
    });
    return { applied: true, quotationPersisted: false, input: scenario.input };
  }

  async decide(id: string, input: RecommendationDecisionDto, user: AuthUser) {
    const event = await this.prisma.recommendationEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Recomendación no encontrada");
    if (event.userId !== user.id) throw new ForbiddenException("La recomendación pertenece a otro usuario");
    if (event.appliedAt) throw new ConflictException("La recomendación ya fue aplicada al borrador");
    return this.prisma.recommendationEvent.update({ where: { id }, data: { accepted: input.accepted } });
  }
}
