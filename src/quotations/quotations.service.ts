import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, QuotationStatus } from "../generated/prisma/client";
import Decimal from "decimal.js";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { CalculatorService } from "../calculator/calculator.service";
import { dec } from "../common/money";
import { jsonSafe } from "../common/json";
import { SequenceService } from "../common/sequence.service";
import { unitLabel } from "../common/units";

const money = (value: string | null | undefined) =>
  value == null ? null : dec(value).toFixed(12);
const quoteInclude = {
  customer: { include: { contact: true } },
  items: {
    include: {
      product: true,
      materials: true,
      laborTasks: { include: { technique: true, worker: true } },
      firings: { include: { kiln: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  totals: true,
};

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private calculator: CalculatorService,
    private sequences: SequenceService,
  ) {}

  private async allocateCode(tx: Prisma.TransactionClient) {
    return this.sequences.next("QUOTATION", tx);
  }
  private makeItemRows(lines: any[], input: any, totals: any) {
    const totalQty = dec(totals.quantity ?? 0);
    const factor = dec(totals.productionFactor ?? 3);
    const tax = dec(totals.igvRate ?? 0);
    const other = totals.otherCosts == null ? null : dec(totals.otherCosts);
    // When commercial rounding is enabled, spread the adjustment proportionally over the lines.
    const roundingRatio =
      totals.subtotal != null &&
      totals.subtotalBeforeRounding != null &&
      !dec(totals.subtotalBeforeRounding).isZero()
        ? dec(totals.subtotal).div(dec(totals.subtotalBeforeRounding))
        : new Decimal(1);
    return lines.map((line, index) => {
      const source = input.items[index] ?? {};
      const q = dec(line.quantity);
      const material =
        line.materialCost == null ? null : dec(line.materialCost);
      const labor = line.laborCost == null ? null : dec(line.laborCost);
      const firing = line.firingCost == null ? null : dec(line.firingCost);
      const technical =
        material == null || labor == null || firing == null
          ? null
          : material.plus(labor).plus(firing);
      const otherShare =
        other == null || totalQty.isZero() ? null : other.mul(q).div(totalQty);
      const subtotal =
        technical == null || otherShare == null
          ? null
          : technical.mul(factor).plus(otherShare).mul(roundingRatio);
      const lineTotal =
        subtotal == null ? null : subtotal.mul(new Decimal(1).plus(tax));
      return {
        productId: line.productId ?? null,
        name: line.name,
        quantity: line.quantity,
        moldCount: source.moldCount ?? 1,
        productionTimePerCycleMinutes:
          source.productionTimePerCycleMinutes ??
          line.productionTimePerCycleMinutes ??
          "480",
        lengthCm: line.lengthCm,
        widthCm: line.widthCm,
        heightCm: line.heightCm,
        clayWeightG: line.clayWeightG ?? "0",
        materialCost: line.materialCost,
        laborCost: line.laborCost,
        firingCost: line.firingCost,
        unitPrice: lineTotal == null ? null : lineTotal.div(q).toFixed(12),
        lineTotal: lineTotal == null ? null : lineTotal.toFixed(12),
        inputSnapshot: jsonSafe({ input: source, calculation: line }),
        materials: {
          create: (line.materials ?? []).map((materialRow: any) => ({
            materialType: materialRow.type,
            productId: materialRow.productId ?? null,
            productName: materialRow.productName ?? null,
            quantity: materialRow.quantity ?? "0",
            unit: materialRow.unit ?? "g",
            appliedUnitCost: money(materialRow.appliedUnitCost),
            cost: money(materialRow.cost),
          })),
        },
        laborTasks: {
          create: (line.laborTasks ?? [])
            .filter((task: any) => task.techniqueId)
            .map((task: any) => ({
              workerId: task.workerId ?? null,
              workerName: task.workerName ?? null,
              techniqueId: task.techniqueId,
              techniqueName: task.techniqueName,
              quantity: task.quantity ?? "0",
              factor1: task.factor1,
              factor2: task.factor2,
              cycles: task.cycles,
              calculatedHours: task.calculatedHours,
              appliedHours: task.appliedHours,
              rateOverride: money(task.rateOverride),
              rate: money(task.rate),
              cost: money(task.cost),
            })),
        },
        firings: {
          create: (line.firings ?? []).map((firing: any) => ({
            stage: firing.stage,
            firingType: firing.firingType,
            kilnId: firing.kilnId ?? null,
            kilnName: firing.kilnName ?? null,
            capacityCm3: firing.capacityCm3,
            tariff: firing.tariff,
            occupancy: firing.occupancy,
            batches: firing.batches,
            volumeCm3: firing.volumeCm3 ?? "0",
            cost: money(firing.cost),
          })),
        },
      };
    });
  }
  private quoteData(
    input: any,
    calc: any,
    customerId: string,
    createdById?: string,
  ) {
    const t = calc.totals;
    return {
      status: QuotationStatus.DRAFT,
      costStatus: calc.status,
      customerId,
      validityDays: input.validityDays ?? 30,
      productionFactor: t.productionFactor ?? "3",
      productionDays: t.productionDays,
      materialCost: money(t.materialCost),
      laborCost: money(t.laborCost),
      firingCost: money(t.firingCost),
      technicalCost: money(t.technicalCost),
      otherCosts: money(t.otherCosts),
      subtotal: money(t.subtotal),
      igvRate: money(t.igvRate) ?? "0.18",
      igvAmount: money(t.igvAmount),
      total: money(t.total),
      unitPrice: money(t.unitPrice),
      inputSnapshot: jsonSafe({ input, calculation: calc }),
      ...(createdById ? { createdById } : {}),
    };
  }
  private totalsData(calc: any) {
    const t = calc.totals;
    return {
      materialCost: money(t.materialCost),
      laborCost: money(t.laborCost),
      firingCost: money(t.firingCost),
      technicalCost: money(t.technicalCost),
      productionFactor: t.productionFactor,
      productionDays: t.productionDays,
      otherCosts: money(t.otherCosts),
      subtotal: money(t.subtotal),
      igvRate: money(t.igvRate) ?? "0.18",
      igvAmount: money(t.igvAmount),
      total: money(t.total),
      unitPrice: money(t.unitPrice),
    };
  }
  async create(input: any, actorId: string) {
    if (!input?.customerId)
      throw new BadRequestException("Selecciona un cliente");
    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer || !customer.isActive)
      throw new NotFoundException("Cliente no encontrado o inactivo");
    const calc = await this.calculator.calculate(input);
    return this.prisma.$transaction(async (tx) => {
      const code = await this.allocateCode(tx);
      const quote = await tx.quotation.create({
        data: { ...this.quoteData(input, calc, customer.id, actorId), code },
      });
      const rows = this.makeItemRows(calc.lines, input, calc.totals);
      for (const row of rows)
        await tx.quotationItem.create({
          data: { ...row, quotationId: quote.id } as any,
        });
      await tx.quotationTotals.create({
        data: { quotationId: quote.id, ...this.totalsData(calc) } as any,
      });
      const after = await tx.quotation.findUnique({
        where: { id: quote.id },
        include: quoteInclude,
      });
      await this.audit.write(
        actorId,
        "CREATE",
        "Quotation",
        quote.id,
        null,
        after,
        tx,
      );
      return { data: after };
    });
  }
  async updateDraft(id: string, input: any, actorId: string) {
    const existing = await this.prisma.quotation.findUnique({
      where: { id },
      include: quoteInclude,
    });
    if (!existing) throw new NotFoundException("Cotización no encontrada");
    if (existing.status !== QuotationStatus.DRAFT)
      throw new ConflictException("Solo se pueden editar borradores");
    const customerId = input.customerId ?? existing.customerId;
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer || !customer.isActive)
      throw new NotFoundException("Cliente no encontrado o inactivo");
    const calc = await this.calculator.calculate(input);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.quotation.findUnique({
        where: { id },
        include: quoteInclude,
      });
      if (!before || before.status !== QuotationStatus.DRAFT)
        throw new ConflictException("El borrador cambió mientras se editaba");
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      await tx.quotation.update({
        where: { id },
        data: this.quoteData(input, calc, customer.id) as any,
      });
      for (const row of this.makeItemRows(calc.lines, input, calc.totals))
        await tx.quotationItem.create({
          data: { ...row, quotationId: id } as any,
        });
      await tx.quotationTotals.upsert({
        where: { quotationId: id },
        create: { quotationId: id, ...this.totalsData(calc) } as any,
        update: this.totalsData(calc) as any,
      });
      const after = await tx.quotation.findUnique({
        where: { id },
        include: quoteInclude,
      });
      await this.audit.write(
        actorId,
        "UPDATE",
        "Quotation",
        id,
        before,
        after,
        tx,
      );
      return { data: after };
    });
  }
  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page ?? 1) || 1),
      pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25) || 25));
    const where: any = {};
    if (query.status) {
      const statuses = query.status
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (query.customerId) where.customerId = query.customerId;
    if (query.q)
      where.OR = [
        { code: { contains: query.q, mode: "insensitive" } },
        {
          customer: { displayName: { contains: query.q, mode: "insensitive" } },
        },
      ];
    const [data, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: {
          customer: true,
          items: { select: { id: true, name: true, quantity: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { data, pagination: { total, page, pageSize } };
  }
  async get(id: string) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id },
      include: quoteInclude,
    });
    if (!quote) throw new NotFoundException("Cotización no encontrada");
    return { data: quote };
  }
  async confirm(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.quotation.findUnique({
        where: { id },
        include: quoteInclude,
      });
      if (!before) throw new NotFoundException("Cotización no encontrada");
      if (before.status !== QuotationStatus.DRAFT)
        throw new ConflictException("Solo se puede confirmar un borrador");
      if (before.costStatus !== "READY" || before.total == null)
        throw new ConflictException("La cotización tiene costos incompletos");
      const confirmedAt = new Date();
      const snapshot = {
        code: before.code,
        createdAt: before.createdAt.toISOString(),
        confirmedAt: confirmedAt.toISOString(),
        validUntil: new Date(
          confirmedAt.getTime() + before.validityDays * 86400000,
        ).toISOString(),
        customer: {
          name: before.customer.displayName,
          type: before.customer.customerType,
        },
        items: before.items.map((item) => ({
          name: item.name,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice?.toString() ?? null,
          lineTotal: item.lineTotal?.toString() ?? null,
        })),
        totals: {
          subtotal: before.subtotal?.toString() ?? null,
          igvRate: before.igvRate.toString(),
          igvAmount: before.igvAmount?.toString() ?? null,
          total: before.total.toString(),
        },
      };
      const after = await tx.quotation.update({
        where: { id },
        data: {
          status: QuotationStatus.CONFIRMED,
          confirmedAt,
          economicSnapshot: jsonSafe(snapshot),
        },
        include: quoteInclude,
      });
      await this.audit.write(
        actorId,
        "CONFIRM",
        "Quotation",
        id,
        before,
        after,
        tx,
      );
      return { data: after };
    });
  }
  async cancel(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.quotation.findUnique({
        where: { id },
        include: quoteInclude,
      });
      if (!before) throw new NotFoundException("Cotización no encontrada");
      if (before.status === QuotationStatus.CANCELLED)
        throw new ConflictException("La cotización ya está cancelada");
      const after = await tx.quotation.update({
        where: { id },
        data: { status: QuotationStatus.CANCELLED, cancelledAt: new Date() },
        include: quoteInclude,
      });
      await this.audit.write(
        actorId,
        "CANCEL",
        "Quotation",
        id,
        before,
        after,
        tx,
      );
      return { data: after };
    });
  }
  /** Client-facing data only: never material, labor, kiln, factor or margin values. */
  async publicDocument(id: string) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id },
      include: quoteInclude,
    });
    if (!quote) throw new NotFoundException("Cotización no encontrada");
    if (quote.costStatus !== "READY" || quote.total == null)
      throw new ConflictException(
        "Completa los costos pendientes en el cotizador para generar el PDF.",
      );
    const snapshot = (quote.economicSnapshot ?? null) as any;
    const contact = quote.customer.contact;
    const trim = (value: unknown) =>
      value == null
        ? null
        : Number(value).toLocaleString("es-PE", { maximumFractionDigits: 2 });
    const dims = (item: any) =>
      item?.lengthCm != null && item?.widthCm != null && item?.heightCm != null
        ? `${trim(item.lengthCm)} × ${trim(item.widthCm)} × ${trim(item.heightCm)} cm`
        : null;
    const sourceItems =
      snapshot?.items ??
      quote.items.map((item) => ({
        name: item.name,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice?.toString() ?? null,
        lineTotal: item.lineTotal?.toString() ?? null,
      }));
    const issuedAt =
      snapshot?.confirmedAt ??
      quote.confirmedAt?.toISOString() ??
      quote.createdAt.toISOString();
    return {
      code: quote.code,
      status: quote.status,
      issuedAt,
      validUntil:
        snapshot?.validUntil ??
        new Date(
          new Date(issuedAt).getTime() + quote.validityDays * 86400000,
        ).toISOString(),
      validityDays: quote.validityDays,
      customer: {
        name: snapshot?.customer?.name ?? quote.customer.displayName,
        documentType: contact?.identificationType ?? null,
        documentNumber: contact?.identificationNumber ?? null,
        email: contact?.email ?? null,
        phone: contact?.phone ?? null,
        address: contact?.street ?? null,
      },
      items: sourceItems.map((item: any, index: number) => ({
        name: item.name,
        detail: dims(quote.items[index]),
        quantity: item.quantity,
        unit: unitLabel("und"),
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      totals: snapshot?.totals ?? {
        subtotal: quote.subtotal?.toString() ?? null,
        igvRate: quote.igvRate.toString(),
        igvAmount: quote.igvAmount?.toString() ?? null,
        total: quote.total.toString(),
      },
    };
  }
}
