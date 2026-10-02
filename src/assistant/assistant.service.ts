import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import {
  AssistantKnowledgeStatus,
  AssistantSuggestionStatus,
  ProductType,
  QuotationStatus,
} from "../generated/prisma/enums";
import { PrismaService } from "../common/prisma.service";
import { CalculatorService, calculateMoldProduction } from "../calculator/calculator.service";
import { AuthUser } from "../common/auth.guards";
import {
  AssistantAskDto,
  AssistantContextDto,
  AssistantFeedbackDto,
  AssistantKnowledgeDto,
  AssistantSuggestionDto,
  AssistantSuggestionReviewDto,
  FiringOutcomeDto,
  QuotationOutcomeDto,
} from "./assistant.dto";
import { ASSISTANT_PROVIDER, AssistantProvider } from "./assistant.provider";

const STEP_GUIDES = [
  {
    slug: "cotizador-cliente",
    step: "CLIENTE",
    title: "Cliente y modalidad comercial",
    tags: ["cliente", "pormenor", "mayor", "comercial"],
    content:
      "Selecciona o crea el cliente y confirma si la venta es por menor o por mayor. La modalidad afecta los valores comerciales configurados; no cambia por sí sola materiales ni procesos de fabricación.",
  },
  {
    slug: "cotizador-producto",
    step: "PRODUCTO",
    title: "Piezas, dimensiones y moldes",
    tags: ["producto", "cantidad", "dimensiones", "molde", "ciclo", "tiempo"],
    content:
      "Agrega productos del maestro o define una pieza personalizada. Registra cantidad y dimensiones solicitadas. Los moldes indican cuántas piezas pueden producirse en paralelo: ciclos = CEIL(cantidad / moldes); tiempo activo = ciclos × minutos por ciclo. Más moldes reducen tiempo; solo reducen costo de mano de obra facturable cuando las horas pagadas también disminuyen.",
  },
  {
    slug: "cotizador-materiales",
    step: "MATERIALES",
    title: "Materiales y recetas",
    tags: ["material", "pasta", "esmalte", "receta", "peso"],
    content:
      "Selecciona pasta y esmalte desde el maestro. Un material preparado usa el costo de su receta; si falta el costo de un ingrediente, el costo queda incompleto y no se reemplaza por cero. El porcentaje inicial de esmalte es el configurado (15% por defecto) y puede editarse en el cálculo.",
  },
  {
    slug: "cotizador-mano-de-obra",
    step: "LABOR",
    title: "Mano de obra por trabajador",
    tags: ["trabajador", "técnica", "interno", "externo", "horas", "tarifa"],
    content:
      "Asigna cada trabajo manual a un trabajador habilitado para esa técnica. Los factores y la productividad determinan capacidad y tiempo. El costo se agrupa una vez por trabajador y se calcula con tarifa diaria / horas por jornada. Un trabajador INTERNAL_INCLUDED muestra horas pero aporta S/ 0 de mano de obra adicional; uno HOURLY se cobra por sus horas. Las tarifas por técnica antiguas no se usan para volver a cobrar cada tarea.",
  },
  {
    slug: "cotizador-quema",
    step: "FIRING",
    title: "Quemas y hornos",
    tags: ["quema", "horno", "compartido", "exclusivo", "volumen", "esmalte"],
    content:
      "Configura las etapas de quema que requiere el acabado y selecciona un horno. En modo compartido se distribuye el costo por ocupación; en exclusivo se cobra la hornada completa. El cálculo usa capacidad, volumen y tarifa del horno, sin aplicar un factor de horno adicional. No elimines una etapa necesaria para completar el esmalte.",
  },
  {
    slug: "cotizador-precio",
    step: "PRICE",
    title: "Precio y desglose comercial",
    tags: ["precio", "costo", "factor", "igv", "impuesto", "margen"],
    content:
      "El backend calcula materiales, mano de obra, quemas y otros costos; luego aplica el factor de producción, redondeo configurado e IGV. El asistente no cambia estas reglas. Los salarios, costos internos y márgenes solo se muestran a roles autorizados.",
  },
  {
    slug: "cotizador-revisar",
    step: "REVIEW",
    title: "Revisión y confirmación",
    tags: ["revisar", "snapshot", "confirmar", "pdf", "histórico"],
    content:
      "Revisa cliente, líneas, costos, plazo y PDF antes de confirmar. La confirmación conserva una instantánea histórica; una cotización confirmada se consulta en modo lectura. Para cambiarla, duplica a un nuevo borrador. El asistente no modifica la cotización automáticamente.",
  },
];

const safeDecimal = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const number =
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
      ? value.toNumber()
      : Number(value);
  return Number.isFinite(number) ? number : null;
};

@Injectable()
export class AssistantService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: CalculatorService,
    @Inject(ASSISTANT_PROVIDER) private readonly provider: AssistantProvider,
  ) {}

  async onModuleInit() {
    for (const guide of STEP_GUIDES) {
      const published = await this.prisma.assistantKnowledgeEntry.findFirst({
        where: { slug: guide.slug, status: AssistantKnowledgeStatus.PUBLISHED },
      });
      if (!published) {
        const latest = await this.prisma.assistantKnowledgeEntry.findFirst({
          where: { slug: guide.slug },
          orderBy: { version: "desc" },
        });
        await this.prisma.assistantKnowledgeEntry.create({
          data: {
            slug: guide.slug,
            title: guide.title,
            content: guide.content,
            tags: guide.tags,
            module: "Cotizador",
            step: guide.step,
            version: (latest?.version ?? 0) + 1,
            status: AssistantKnowledgeStatus.PUBLISHED,
          },
        });
      }
    }
  }

  private normalize(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private slugFrom(value: string) {
    return this.normalize(value).replace(/\s+/g, "-").slice(0, 90) || "conocimiento";
  }

  private async newKnowledgeVersion(
    input: AssistantKnowledgeDto,
    userId: string,
  ) {
    const slug = this.slugFrom(input.slug);
    const latest = await this.prisma.assistantKnowledgeEntry.findFirst({
      where: { slug },
      orderBy: { version: "desc" },
    });
    const publish = input.publish ?? true;
    if (publish) {
      await this.prisma.assistantKnowledgeEntry.updateMany({
        where: { slug, status: AssistantKnowledgeStatus.PUBLISHED },
        data: { status: AssistantKnowledgeStatus.ARCHIVED },
      });
    }
    return this.prisma.assistantKnowledgeEntry.create({
      data: {
        slug,
        title: input.title.trim(),
        content: input.content.trim(),
        tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
        module: input.module?.trim() || null,
        step: input.step?.trim().toUpperCase() || null,
        adminOnly: input.adminOnly ?? false,
        version: (latest?.version ?? 0) + 1,
        status: publish
          ? AssistantKnowledgeStatus.PUBLISHED
          : AssistantKnowledgeStatus.DRAFT,
        createdById: userId,
      },
    });
  }

  async listKnowledge(user: AuthUser, module?: string, step?: string) {
    const isAdmin = user.role === "ADMIN";
    return this.prisma.assistantKnowledgeEntry.findMany({
      where: {
        ...(isAdmin ? {} : { status: AssistantKnowledgeStatus.PUBLISHED }),
        ...(isAdmin ? {} : { adminOnly: false }),
        AND: [
          ...(module ? [{ OR: [{ module: null }, { module }] }] : []),
          ...(step ? [{ OR: [{ step: null }, { step: step.toUpperCase() }] }] : []),
        ],
      },
      orderBy: [{ slug: "asc" }, { version: "desc" }],
    });
  }

  async createKnowledge(input: AssistantKnowledgeDto, user: AuthUser) {
    return this.newKnowledgeVersion(input, user.id);
  }

  async submitSuggestion(input: AssistantSuggestionDto, user: AuthUser) {
    return this.prisma.assistantKnowledgeSuggestion.create({
      data: {
        question: input.question.trim(),
        proposedAnswer: input.proposedAnswer?.trim() || null,
        route: input.context.route,
        module: input.context.module,
        step: input.context.step?.toUpperCase() ?? null,
        submittedById: user.id,
      },
    });
  }

  async listSuggestions(status?: AssistantSuggestionStatus) {
    return this.prisma.assistantKnowledgeSuggestion.findMany({
      where: status ? { status } : {},
      include: { knowledgeEntry: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async reviewSuggestion(
    id: string,
    input: AssistantSuggestionReviewDto,
    user: AuthUser,
  ) {
    const suggestion = await this.prisma.assistantKnowledgeSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) throw new NotFoundException("Sugerencia no encontrada");
    if (suggestion.status !== AssistantSuggestionStatus.PENDING)
      throw new ConflictException("La sugerencia ya fue revisada");
    if (input.decision === "REJECT") {
      return this.prisma.assistantKnowledgeSuggestion.update({
        where: { id },
        data: {
          status: AssistantSuggestionStatus.REJECTED,
          reviewedById: user.id,
          reviewNote: input.reviewNote?.trim() || null,
          reviewedAt: new Date(),
        },
      });
    }
    const approvedAnswer = input.proposedAnswer?.trim() || suggestion.proposedAnswer?.trim();
    if (!approvedAnswer)
      throw new BadRequestException("Agrega una respuesta antes de aprobarla");
    const entry = await this.newKnowledgeVersion(
      {
        slug: this.slugFrom(suggestion.question),
        title: suggestion.question.slice(0, 160),
        content: approvedAnswer,
        tags: [suggestion.module, ...(suggestion.step ? [suggestion.step] : [])],
        module: suggestion.module,
        step: suggestion.step ?? undefined,
        publish: true,
        adminOnly: input.adminOnly ?? false,
      },
      user.id,
    );
    return this.prisma.assistantKnowledgeSuggestion.update({
      where: { id },
      data: {
        status: AssistantSuggestionStatus.APPROVED,
        reviewedById: user.id,
        reviewNote: input.reviewNote?.trim() || null,
        reviewedAt: new Date(),
        knowledgeEntryId: entry.id,
      },
      include: { knowledgeEntry: true },
    });
  }

  private async findKnowledge(context: AssistantContextDto, question: string, role: AuthUser["role"]) {
    const entries = await this.prisma.assistantKnowledgeEntry.findMany({
      where: { status: AssistantKnowledgeStatus.PUBLISHED, ...(role === "ADMIN" ? {} : { adminOnly: false }) },
      orderBy: [{ version: "desc" }],
    });
    const query = new Set(this.normalize(question).split(" ").filter((word) => word.length > 2));
    const scored = entries.map((entry) => {
      let score = 0;
      if (entry.module && this.normalize(entry.module) === this.normalize(context.module)) score += 5;
      if (entry.step && context.step && this.normalize(entry.step) === this.normalize(context.step)) score += 10;
      for (const tag of entry.tags) if (query.has(this.normalize(tag))) score += 2;
      const titleWords = this.normalize(entry.title).split(" ");
      for (const word of titleWords) if (query.has(word)) score += 1;
      return { entry, score };
    });
    const best = scored.sort((a, b) => b.score - a.score)[0];
    return best && best.score > 0 ? best.entry : null;
  }

  private moldExplanation(input: AssistantAskDto["currentInput"]) {
    if (!input?.items?.length) return null;
    const rows = input.items.map((item) => {
      const quantity = Number(item.quantity ?? 0);
      const moldCount = Number(item.moldCount ?? 1);
      const cycleMinutes = Number(item.productionTimePerCycleMinutes ?? 480);
      if (!(quantity > 0 && moldCount > 0 && cycleMinutes > 0)) return null;
      const result = calculateMoldProduction(quantity, moldCount, cycleMinutes);
      return {
        name: item.name ?? "Pieza",
        quantity,
        moldCount,
        cycleMinutes,
        cycles: result.cycles.toNumber(),
        activeHours: result.activeHours.toNumber(),
      };
    }).filter((row): row is NonNullable<typeof row> => row != null);
    if (!rows.length) return null;
    return rows.map((row) => `${row.name}: ${row.quantity} piezas con ${row.moldCount} molde(s) y ${row.cycleMinutes} min/ciclo → CEIL(${row.quantity} / ${row.moldCount}) = ${row.cycles} ciclos; ${row.cycles} × ${row.cycleMinutes} = ${row.activeHours * 60} min = ${row.activeHours} h activas.`).join("\n");
  }

  async ask(input: AssistantAskDto, user: AuthUser) {
    const context = {
      ...input.context,
      route: input.context.route.split("?")[0],
      step: input.context.step?.toUpperCase(),
    };
    const question = input.question.trim();
    const lower = this.normalize(question);
    const costsRequested = /\b(costo|costos|cuesta|cuestan|costar|cuanto|precio|precios|salario|tarifa|margen)\b/.test(lower);
    let answer: string;
    let resolved = true;
    const knowledge = await this.findKnowledge(context, question, user.role);

    if (costsRequested && user.role !== "ADMIN") {
      answer = "Tu rol no tiene permiso para consultar precios, salarios ni costos internos. Puedo ayudarte con los pasos del proceso y con los tiempos de producción permitidos.";
    } else if (costsRequested && input.currentInput && user.role === "ADMIN") {
      const result = await this.calculator.calculate(input.currentInput);
      const totals = result.totals;
      answer = `Desglose calculado por el backend: materiales S/ ${totals.materialCost ?? "incompleto"}; mano de obra S/ ${totals.laborCost ?? "incompleto"}; quemas S/ ${totals.firingCost ?? "incompleto"}; otros costos S/ ${totals.otherCosts ?? "incompleto"}; costo técnico S/ ${totals.technicalCost ?? "incompleto"}; factor de producción ${totals.productionFactor}; IGV S/ ${totals.igvAmount ?? "incompleto"}; total S/ ${totals.total ?? "incompleto"}. ${result.status === "COST_INCOMPLETE" ? "Hay componentes incompletos; no se interpretan como cero." : ""}`;
    } else if (/\b(hora|horas|ciclo|ciclos|molde|moldes|tiempo)\b/.test(lower) && input.currentInput) {
      const explanation = this.moldExplanation(input.currentInput);
      answer = explanation ?? this.provider.answer({ question, context, knowledge }).text;
      if (explanation && knowledge)
        answer += `\n\nRegla: ${knowledge.content}`;
    } else {
      const response = this.provider.answer({
        question,
        context,
        knowledge: knowledge
          ? { title: knowledge.title, content: knowledge.content, version: knowledge.version }
          : null,
      });
      answer = response.text;
      resolved = response.resolved;
    }

    const interaction = await this.prisma.assistantInteraction.create({
      data: {
        userId: user.id,
        question,
        answer,
        route: context.route,
        module: context.module,
        step: context.step ?? null,
        entityId: context.entityId ?? null,
        resolved,
        costSensitive: costsRequested && user.role === "ADMIN",
      },
    });
    return {
      interactionId: interaction.id,
      answer,
      resolved,
      knowledge: knowledge ? { id: knowledge.id, title: knowledge.title, version: knowledge.version } : null,
      context,
      suggestionAvailable: !resolved,
    };
  }

  async history(user: AuthUser) {
    const interactions = await this.prisma.assistantInteraction.findMany({
      where: { userId: user.id },
      include: { feedback: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return interactions.map((interaction) =>
      interaction.costSensitive && user.role !== "ADMIN"
        ? { ...interaction, answer: "Esta respuesta contiene importes reservados para el rol ADMIN." }
        : interaction,
    );
  }

  async unresolvedQuestions() {
    return this.prisma.assistantInteraction.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { question: true, route: true, module: true, step: true, createdAt: true },
    });
  }

  async feedback(input: AssistantFeedbackDto, user: AuthUser) {
    const interaction = await this.prisma.assistantInteraction.findUnique({
      where: { id: input.interactionId },
      select: { id: true, userId: true },
    });
    if (!interaction) throw new NotFoundException("Interacción no encontrada");
    if (interaction.userId !== user.id)
      throw new ForbiddenException("Solo puedes calificar tus propias interacciones");
    const result = await this.prisma.assistantFeedback.upsert({
      where: { interactionId: interaction.id },
      create: {
        interactionId: interaction.id,
        userId: user.id,
        helpful: input.helpful,
        reason: input.reason?.trim() || null,
      },
      update: {
        helpful: input.helpful,
        reason: input.reason?.trim() || null,
        createdAt: new Date(),
      },
    });
    await this.prisma.assistantInteraction.update({
      where: { id: interaction.id },
      data: { resolved: input.helpful },
    });
    return result;
  }

  async createQuotationOutcome(input: QuotationOutcomeDto, user: AuthUser) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: input.quotationId },
      include: {
        items: {
          include: {
            product: { select: { id: true, productType: true } },
            materials: { select: { productId: true, productName: true, materialType: true } },
            laborTasks: { select: { workerId: true, techniqueId: true, appliedHours: true } },
            firings: { select: { stage: true, firingType: true, kilnId: true, kilnName: true, volumeCm3: true, capacityCm3: true, cost: true } },
          },
        },
      },
    });
    if (!quotation) throw new NotFoundException("Cotización no encontrada");
    if (quotation.status !== QuotationStatus.CONFIRMED)
      throw new ConflictException("Registra resultados reales solo para una cotización confirmada");
    const snapshot = quotation.inputSnapshot as any;
    const sourceItems: any[] = snapshot?.input?.items ?? [];
    const calculation: any = snapshot?.calculation ?? {};
    const productTypes = [...new Set(quotation.items
      .map((item) => item.product?.productType)
      .filter((value): value is ProductType => value != null))];
    const dimensions = sourceItems.map((item) => ({
      lengthCm: safeDecimal(item.lengthCm),
      widthCm: safeDecimal(item.widthCm),
      heightCm: safeDecimal(item.heightCm),
    }));
    const materials = quotation.items.flatMap((item) => item.materials.map((material) => ({
      productId: material.productId,
      materialType: material.materialType,
      productName: material.productName,
    })));
    const workerRows = new Map<string, { workerId: string | null; techniqueIds: Set<string>; hours: number }>();
    for (const item of quotation.items) for (const task of item.laborTasks) {
      const key = task.workerId ?? "unassigned";
      const row = workerRows.get(key) ?? { workerId: task.workerId, techniqueIds: new Set<string>(), hours: 0 };
      row.techniqueIds.add(task.techniqueId);
      row.hours += safeDecimal(task.appliedHours) ?? 0;
      workerRows.set(key, row);
    }
    const workers = [...workerRows.values()].map((row) => ({ workerId: row.workerId, techniqueIds: [...row.techniqueIds], activeHours: row.hours }));
    const techniques = [...new Set(quotation.items.flatMap((item) => item.laborTasks.map((task) => task.techniqueId)))];
    const firingConfiguration = quotation.items.flatMap((item) => item.firings.map((firing) => ({
      stage: firing.stage,
      firingType: firing.firingType,
      kilnId: firing.kilnId,
      kilnName: firing.kilnName,
      volumeCm3: safeDecimal(firing.volumeCm3),
      capacityCm3: safeDecimal(firing.capacityCm3),
      estimatedCost: safeDecimal(firing.cost),
    })));
    const activeHours = calculation.lines?.reduce((sum: number, line: any) => sum + (safeDecimal(line.activeHours) ?? 0), 0) ?? null;
    const quantity = quotation.items.reduce((sum, item) => sum + item.quantity.toNumber(), 0);
    const moldCount = Math.max(1, ...sourceItems.map((item) => Number(item.moldCount ?? 1)).filter(Number.isFinite));
    const estimatedTime = input.estimatedTime ?? quotation.productionDays.toNumber();
    return this.prisma.quotationOutcome.create({
      data: {
        quotationId: quotation.id,
        productTypes,
        quantity,
        dimensions,
        materials,
        moldCount,
        workers,
        techniques,
        activeHours,
        firingConfiguration,
        estimatedCost: quotation.total?.toNumber() ?? null,
        finalCost: input.finalCost ?? null,
        estimatedTime,
        actualTime: input.actualTime ?? null,
        notes: input.notes?.trim() || null,
        resultQuality: input.resultQuality?.trim() || null,
        outcomeDate: input.outcomeDate ? new Date(input.outcomeDate) : new Date(),
        createdById: user.id,
      },
    });
  }

  async createFiringOutcome(input: FiringOutcomeDto, user: AuthUser) {
    const capacity = input.capacityCm3;
    if (!(capacity > 0)) throw new BadRequestException("La capacidad debe ser mayor que cero");
    if (input.kilnId) {
      const kiln = await this.prisma.kiln.findUnique({ where: { id: input.kilnId } });
      if (!kiln || !kiln.isActive) throw new NotFoundException("Horno no encontrado o inactivo");
    }
    return this.prisma.firingOutcome.create({
      data: {
        kilnId: input.kilnId ?? null,
        kilnName: input.kilnName?.trim() || null,
        firingType: input.firingType,
        volumeCm3: input.volumeCm3,
        capacityCm3: capacity,
        occupancyRatio: input.volumeCm3 / capacity,
        quantity: input.quantity,
        productTypes: input.productTypes,
        materials: input.materials,
        estimatedCost: input.estimatedCost ?? null,
        realCost: input.realCost ?? null,
        durationMinutes: input.durationMinutes ?? null,
        damagedPieces: input.damagedPieces ?? 0,
        observations: input.observations?.trim() || null,
        outcomeDate: input.outcomeDate ? new Date(input.outcomeDate) : new Date(),
        createdById: user.id,
      },
    });
  }

  async recordRecommendationResult(
    input: { eventId: string; realSaving?: number; estimatedTimeChange?: number; realTimeChange?: number; resultQuality?: string },
    user: AuthUser,
  ) {
    const event = await this.prisma.recommendationEvent.findUnique({ where: { id: input.eventId } });
    if (!event) throw new NotFoundException("Recomendación no encontrada");
    const estimatedTimeChange = input.estimatedTimeChange ?? null;
    const realTimeChange = input.realTimeChange ?? null;
    const estimatedSaving = event.estimatedSaving?.toNumber() ?? null;
    return this.prisma.recommendationResult.upsert({
      where: { recommendationId: event.id },
      create: {
        recommendationId: event.id,
        estimatedSaving,
        realSaving: input.realSaving ?? null,
        estimatedTimeChange,
        realTimeChange,
        resultQuality: input.resultQuality?.trim() || null,
        recordedById: user.id,
      },
      update: {
        realSaving: input.realSaving ?? null,
        estimatedTimeChange,
        realTimeChange,
        resultQuality: input.resultQuality?.trim() || null,
        recordedById: user.id,
        createdAt: new Date(),
      },
    });
  }

  async adminSummary() {
    const [knowledgeCount, pendingSuggestions, unresolvedQuestions, outcomes, firingOutcomes, recommendationEvents] = await Promise.all([
      this.prisma.assistantKnowledgeEntry.count({ where: { status: AssistantKnowledgeStatus.PUBLISHED } }),
      this.prisma.assistantKnowledgeSuggestion.count({ where: { status: AssistantSuggestionStatus.PENDING } }),
      this.prisma.assistantInteraction.count({ where: { resolved: false } }),
      this.prisma.quotationOutcome.count(),
      this.prisma.firingOutcome.count(),
      this.prisma.recommendationEvent.count(),
    ]);
    return { knowledgeCount, pendingSuggestions, unresolvedQuestions, quotationOutcomes: outcomes, firingOutcomes, recommendationEvents };
  }

  async recommendationEvents() {
    return this.prisma.recommendationEvent.findMany({
      include: { result: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
