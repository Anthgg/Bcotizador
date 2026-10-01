import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../common/prisma.service';
import { RecipeCostService } from '../recipes/recipe-cost.service';
import { ceil, dec, roundCommercial } from '../common/money';
import { FiringStage, FiringType, ProductType, TechniqueRule } from '../generated/prisma/enums';

export type CostStatusValue = 'READY' | 'COST_INCOMPLETE';
export function calculateLaborCycles(rule: TechniqueRule, quantity: Decimal.Value, factor1?: Decimal.Value | null, factor2?: Decimal.Value | null): Decimal {
  const q = dec(quantity);
  if (q.isNegative()) throw new BadRequestException('La cantidad de trabajo no puede ser negativa');
  if (rule === TechniqueRule.SIMPLE) return q;
  if (!factor1 || dec(factor1).lte(0)) throw new BadRequestException('Falta un factor válido para la técnica');
  const first = ceil(q.div(dec(factor1)));
  if (rule === TechniqueRule.UN_FACTOR) return first;
  if (!factor2 || dec(factor2).lte(0)) throw new BadRequestException('Falta el segundo factor válido para la técnica');
  return first.plus(ceil(q.div(dec(factor2))));
}
export function calculateFiringCost(type: FiringType, tariff: Decimal.Value, volumeCm3: Decimal.Value, capacityCm3: Decimal.Value) {
  const volume = dec(volumeCm3); const capacity = dec(capacityCm3); const rate = dec(tariff);
  if (capacity.lte(0)) throw new BadRequestException('La capacidad del horno debe ser mayor que cero');
  if (rate.isNegative() || volume.isNegative()) throw new BadRequestException('Tarifa o volumen inválido');
  if (type === FiringType.SHARED) {
    const batches = ceil(volume.div(capacity));
    const occupancy = batches.isZero() ? new Decimal(0) : volume.div(capacity).div(batches);
    return { occupancy, batches, cost: rate.mul(occupancy).mul(batches) };
  }
  const batches = ceil(volume.div(capacity));
  return { occupancy: new Decimal(0), batches, cost: rate.mul(batches) };
}
const fmt = (v: Decimal | null | undefined) => v == null ? null : roundCommercial(v, 12).toFixed(12);
const dflt = (value: any, fallback: string) => value == null ? new Decimal(fallback) : dec(value);

@Injectable()
export class CalculatorService {
  constructor(private prisma: PrismaService, private recipeCosts: RecipeCostService) {}

  async calculate(input: any) {
    if (!Array.isArray(input?.items) || input.items.length === 0) throw new BadRequestException('Agrega al menos una línea de producto');
    const settings = await this.prisma.commercialSettings.findUnique({ where: { id: 'default' } });
    const glazeDefault = dflt(settings?.glazeDefaultPct, '0.15');
    const sepX = dflt(settings?.separationXcm, '3');
    const sepY = dflt(settings?.separationYcm, '3');
    const sepZ = dflt(settings?.separationZcm, '3');
    const hoursPerCycle = dflt(settings?.hoursPerCycle, '8');
    const defaultFactor = settings?.productionFactorDefault?.toString() ?? '3';
    const factor = dflt(input.productionFactor, defaultFactor);
    const minimumFactor = dflt(settings?.productionFactorMin, '2');
    if (factor.lt(minimumFactor)) throw new BadRequestException('El factor de producción no puede ser menor que el mínimo configurado');

    const warnings: any[] = [];
    let materialsKnown = true, laborKnown = true, firingKnown = true, cyclesKnown = true;
    let materialsTotal = new Decimal(0), laborTotal = new Decimal(0), firingTotal = new Decimal(0);
    let quantityTotal = new Decimal(0), cyclesTotal = new Decimal(0);
    let geometricVolumeTotal = new Decimal(0), operationalVolumeTotal = new Decimal(0), dimensionsKnown = true;
    const lineRows: any[] = [];
    const sharedGroups = new Map<string, { stage: FiringStage; kiln: any; volume: Decimal; lineIndexes: number[] }>();
    const incomplete = (code: string, message: string, path: string, category: 'material'|'labor'|'firing') => {
      warnings.push({ code, message, path });
      if (category === 'material') materialsKnown = false;
      if (category === 'labor') laborKnown = false;
      if (category === 'firing') firingKnown = false;
    };
    const perGram = async (product: any): Promise<Decimal | null> => {
      if (product?.productType === ProductType.PREPARED_MATERIAL) return this.recipeCosts.costPerUnit(product.id, 'g');
      if (product?.costPerGram != null) return dec(product.costPerGram.toString());
      const unit = String(product?.costUnit ?? product?.purchaseUnit ?? product?.unit ?? '').trim().toLowerCase();
      if (product?.unitCost != null && ['g', 'gr', 'gram', 'gramo', 'gramos'].includes(unit)) return dec(product.unitCost.toString());
      if (product?.unitCost != null && ['kg', 'kilo', 'kilogram', 'kilogramo', 'kilogramos'].includes(unit)) return dec(product.unitCost.toString()).div(1000);
      return null;
    };

    for (let i = 0; i < input.items.length; i++) {
      const line = input.items[i] ?? {};
      const q = dec(line.quantity ?? 1);
      if (q.lte(0)) throw new BadRequestException('La cantidad de cada línea debe ser mayor que cero');
      quantityTotal = quantityTotal.plus(q);
      const product = line.productId ? await this.prisma.product.findUnique({ where: { id: line.productId } }) : null;
      if (line.productId && !product) throw new NotFoundException('Producto no encontrado: ' + line.productId);
      const name = String(line.name ?? product?.name ?? 'Pieza personalizada');
      const clayWeightG = dec(line.clayWeightG ?? 0);
      if (clayWeightG.isNegative()) throw new BadRequestException('El peso de pasta no puede ser negativo');
      const materialRows: any[] = [];
      let lineMaterialKnown = true, lineMaterial = new Decimal(0);
      if (clayWeightG.gt(0)) {
        const field = 'items[' + i + '].clayProductId';
        if (!line.clayProductId) {
          incomplete('CLAY_PRODUCT_REQUIRED', 'Selecciona una pasta para calcular su costo', field, 'material');
          lineMaterialKnown = false;
        } else {
          const clay = await this.prisma.product.findUnique({ where: { id: line.clayProductId } });
          if (!clay) throw new NotFoundException('Pasta no encontrada: ' + line.clayProductId);
          const rate = await perGram(clay), weight = clayWeightG.mul(q);
          if (!rate) { incomplete('COST_MISSING', 'Falta costo por gramo para ' + clay.name, field, 'material'); lineMaterialKnown = false; }
          const cost = rate ? weight.mul(rate) : null;
          if (cost) lineMaterial = lineMaterial.plus(cost);
          materialRows.push({ type: 'CLAY', productId: clay.id, productName: clay.name, quantity: fmt(weight), unit: 'g', appliedUnitCost: fmt(rate), cost: fmt(cost) });
        }
      }
      const glazePercent = line.glazePercent == null ? glazeDefault : dec(line.glazePercent);
      if (glazePercent.isNegative()) throw new BadRequestException('El porcentaje de esmalte no puede ser negativo');
      if (glazePercent.gt(1)) throw new BadRequestException('El porcentaje de esmalte debe indicarse como una fracción entre 0 y 1');
      if (line.glazeProductId && clayWeightG.gt(0) && glazePercent.gt(0)) {
        const glaze = await this.prisma.product.findUnique({ where: { id: line.glazeProductId } });
        if (!glaze) throw new NotFoundException('Esmalte no encontrado: ' + line.glazeProductId);
        const rate = await perGram(glaze), weight = clayWeightG.mul(q).mul(glazePercent);
        if (!rate) { incomplete('COST_MISSING', 'Falta costo por gramo para ' + glaze.name, 'items[' + i + '].glazeProductId', 'material'); lineMaterialKnown = false; }
        const cost = rate ? weight.mul(rate) : null;
        if (cost) lineMaterial = lineMaterial.plus(cost);
        materialRows.push({ type: 'GLAZE', productId: glaze.id, productName: glaze.name, quantity: fmt(weight), unit: 'g', appliedUnitCost: fmt(rate), cost: fmt(cost), percentage: fmt(glazePercent) });
      } else if (line.glazePercent != null && glazePercent.gt(0) && !line.glazeProductId) {
        incomplete('GLAZE_PRODUCT_REQUIRED', 'Indicaste un porcentaje de esmalte pero no seleccionaste un producto', 'items[' + i + '].glazeProductId', 'material');
        lineMaterialKnown = false;
      }

      const laborRows: any[] = [], tasks = Array.isArray(line.laborTasks) ? line.laborTasks : [];
      let lineLabor = new Decimal(0), lineLaborKnown = true;
      for (let j = 0; j < tasks.length; j++) {
        const task = tasks[j] ?? {}, taskPath = 'items[' + i + '].laborTasks[' + j + ']';
        const technique = task.techniqueId ? await this.prisma.technique.findUnique({ where: { id: task.techniqueId } }) : null;
        if (!technique || !technique.isActive) {
          incomplete('TECHNIQUE_REQUIRED', 'Selecciona una técnica activa para cada trabajo', taskPath + '.techniqueId', 'labor');
          lineLaborKnown = false; cyclesKnown = false; continue;
        }
        const taskQty = dec(task.quantity ?? q);
        let worker: any = null, relation: any = null;
        if (!task.workerId) {
          incomplete('WORKER_REQUIRED', 'Asigna un trabajador a cada trabajo manual', taskPath + '.workerId', 'labor');
          lineLaborKnown = false;
        } else {
          worker = await this.prisma.worker.findUnique({ where: { id: task.workerId } });
          if (!worker || !worker.isActive) throw new NotFoundException('Trabajador no encontrado o inactivo: ' + task.workerId);
          relation = await this.prisma.workerTechnique.findUnique({
            where: { workerId_techniqueId: { workerId: task.workerId, techniqueId: technique.id } },
            include: { worker: true },
          });
          if (!relation || !relation.isActive) {
            incomplete('WORKER_TECHNIQUE_REQUIRED', 'El trabajador no está vinculado activamente a esta técnica', taskPath + '.workerId', 'labor');
            lineLaborKnown = false;
          }
        }
        const f1 = task.factor1 ?? relation?.factor1Override?.toString() ?? technique.factor1?.toString() ?? null;
        const f2 = task.factor2 ?? relation?.factor2Override?.toString() ?? technique.factor2?.toString() ?? null;
        const factor1Source = task.factor1 != null ? 'OVERRIDE' : relation?.factor1Override != null ? 'WORKER_TECHNIQUE' : 'TECHNIQUE';
        const factor2Source = task.factor2 != null ? 'OVERRIDE' : relation?.factor2Override != null ? 'WORKER_TECHNIQUE' : 'TECHNIQUE';
        let cycles: Decimal | null = null;
        try { cycles = calculateLaborCycles(technique.rule, taskQty, f1, f2); }
        catch (e) { incomplete('FACTORS_MISSING', (e as Error).message, taskPath, 'labor'); lineLaborKnown = false; cyclesKnown = false; }
        const taskRateOverride = task.rateOverride == null ? null : dec(task.rateOverride);
        if (taskRateOverride?.isNegative()) throw new BadRequestException('La tarifa aplicada no puede ser negativa');
        let rate: Decimal | null = taskRateOverride;
        if (rate == null && relation?.rateOverride != null) rate = dec(relation.rateOverride.toString());
        if (rate == null && technique.cycleRate != null) rate = dec(technique.cycleRate.toString());
        if (rate == null && worker?.dailyRate != null && worker?.hoursPerDay != null && dec(worker.hoursPerDay.toString()).gt(0)) {
          rate = dec(worker.dailyRate.toString()).div(dec(worker.hoursPerDay.toString())).mul(hoursPerCycle);
        }
        const rateSource = taskRateOverride != null ? 'OVERRIDE'
          : relation?.rateOverride != null ? 'WORKER_TECHNIQUE'
            : technique.cycleRate != null ? 'TECHNIQUE' : rate != null ? 'WORKER' : 'MISSING';
        if (rate == null) { incomplete('RATE_MISSING', 'Falta tarifa por ciclo de la técnica o del trabajador', taskPath, 'labor'); lineLaborKnown = false; }
        const cost = cycles != null && rate != null
          ? (task.appliedHours != null && cycles.mul(hoursPerCycle).gt(0)
            ? cycles.mul(rate).mul(dec(task.appliedHours).div(cycles.mul(hoursPerCycle)))
            : cycles.mul(rate))
          : null;
        const calculatedHours = cycles == null ? null : cycles.mul(hoursPerCycle);
        const appliedHours = task.appliedHours != null ? dec(task.appliedHours) : calculatedHours;
        if (appliedHours?.isNegative()) throw new BadRequestException('Las horas aplicadas no pueden ser negativas');
        if (cycles) cyclesTotal = cyclesTotal.plus(cycles);
        if (cost) lineLabor = lineLabor.plus(cost);
        laborRows.push({
          workerId: task.workerId ?? null, workerName: worker?.name ?? task.workerName ?? null,
          techniqueId: technique.id, techniqueName: technique.name, quantity: fmt(taskQty),
          factor1: f1 == null ? null : fmt(dec(f1)), factor1Source,
          factor2: f2 == null ? null : fmt(dec(f2)), factor2Source,
          cycles: fmt(cycles), calculatedHours: fmt(calculatedHours), appliedHours: fmt(appliedHours),
          appliedHoursSource: task.appliedHours != null ? 'OVERRIDE' : 'CALCULATED',
          rateOverride: fmt(taskRateOverride), rate: fmt(rate), rateSource, cost: fmt(cost),
        });
      }

      const dimensionValues = [line.lengthCm, line.widthCm, line.heightCm].filter((value: any) => value != null);
      if (dimensionValues.some((value: any) => dec(value).isNegative())) throw new BadRequestException('Las dimensiones deben ser valores no negativos');
      const hasDimensions = line.lengthCm != null && line.widthCm != null && line.heightCm != null;
      const geometricVolume = hasDimensions
        ? dec(line.lengthCm).mul(dec(line.widthCm)).mul(dec(line.heightCm)).mul(q)
        : new Decimal(0);
      const volume = hasDimensions
        ? dec(line.lengthCm).plus(sepX).mul(dec(line.widthCm).plus(sepY)).mul(dec(line.heightCm).plus(sepZ)).mul(q)
        : new Decimal(0);
      if (volume.isNegative()) throw new BadRequestException('Las dimensiones deben ser valores no negativos');
      if (hasDimensions) {
        geometricVolumeTotal = geometricVolumeTotal.plus(geometricVolume);
        operationalVolumeTotal = operationalVolumeTotal.plus(volume);
      } else {
        dimensionsKnown = false;
      }
      const firingRows: any[] = [];
      const activeFirings = (Array.isArray(line.firings) ? line.firings : []).filter((f: any) => f?.enabled);
      for (let j = 0; j < activeFirings.length; j++) {
        const firing = activeFirings[j], firingPath = 'items[' + i + '].firings[' + j + ']';
        if (!hasDimensions) { incomplete('DIMENSIONS_REQUIRED', 'Agrega largo, ancho y alto para calcular la quema', firingPath, 'firing'); continue; }
        if (!firing.kilnId) { incomplete('KILN_REQUIRED', 'Selecciona un horno para calcular la quema', firingPath + '.kilnId', 'firing'); continue; }
        const kiln = await this.prisma.kiln.findUnique({ where: { id: firing.kilnId } });
        if (!kiln || !kiln.isActive) throw new NotFoundException('Horno no encontrado o inactivo');
        const stage = firing.stage as FiringStage;
        const tariff = stage === FiringStage.LOW ? dec(kiln.lowRate.toString()) : stage === FiringStage.HIGH ? dec(kiln.highRate.toString()) : null;
        if (!tariff) { incomplete('FIRING_STAGE_INVALID', 'La etapa de quema debe ser LOW o HIGH', firingPath + '.stage', 'firing'); continue; }
        const type = firing.firingType as FiringType;
        if (![FiringType.SHARED, FiringType.EXCLUSIVE].includes(type)) { incomplete('FIRING_TYPE_INVALID', 'El tipo debe ser SHARED o EXCLUSIVE', firingPath + '.firingType', 'firing'); continue; }
        const row: any = { stage, firingType: type, kilnId: kiln.id, kilnName: kiln.name, capacityCm3: fmt(dec(kiln.capacityCm3.toString())), tariff: fmt(tariff), volumeCm3: fmt(volume), occupancy: null, batches: null, cost: null };
        firingRows.push(row);
        if (type === FiringType.SHARED) {
          const key = stage + ':' + kiln.id;
          const group = sharedGroups.get(key) ?? { stage, kiln, volume: new Decimal(0), lineIndexes: [] };
          group.volume = group.volume.plus(volume); group.lineIndexes.push(i); sharedGroups.set(key, group);
        } else {
          const cost = calculateFiringCost(type, tariff, volume, kiln.capacityCm3.toString());
          row.occupancy = fmt(cost.occupancy); row.batches = fmt(cost.batches); row.cost = fmt(cost.cost);
          firingTotal = firingTotal.plus(cost.cost);
          lineRows[i] = lineRows[i] ?? {};
          lineRows[i].firingCost = dec(lineRows[i].firingCost).plus(cost.cost).toString();
        }
      }
      if (lineMaterialKnown) materialsTotal = materialsTotal.plus(lineMaterial);
      if (lineLaborKnown) laborTotal = laborTotal.plus(lineLabor);
      lineRows[i] = {
        ...(lineRows[i] ?? {}),
        name, productId: product?.id ?? null, quantity: fmt(q),
        lengthCm: line.lengthCm == null ? null : fmt(dec(line.lengthCm)),
        widthCm: line.widthCm == null ? null : fmt(dec(line.widthCm)),
        heightCm: line.heightCm == null ? null : fmt(dec(line.heightCm)),
        clayWeightG: fmt(clayWeightG),
        geometricVolumeCm3: hasDimensions ? fmt(geometricVolume) : null,
        operationalVolumeCm3: hasDimensions ? fmt(volume) : null,
        volumeCm3: fmt(volume), materials: materialRows,
        materialCost: lineMaterialKnown ? fmt(lineMaterial) : null,
        laborTasks: laborRows, laborCost: lineLaborKnown ? fmt(lineLabor) : null,
        firings: firingRows, firingCost: fmt(dec(lineRows[i]?.firingCost)),
      };
    }

    for (const group of sharedGroups.values()) {
      const rate = group.stage === FiringStage.LOW ? group.kiln.lowRate.toString() : group.kiln.highRate.toString();
      const result = calculateFiringCost(FiringType.SHARED, rate, group.volume, group.kiln.capacityCm3.toString());
      firingTotal = firingTotal.plus(result.cost);
      for (const i of group.lineIndexes) {
        const row = lineRows[i];
        const f = row.firings.find((entry: any) => entry.stage === group.stage && entry.kilnId === group.kiln.id && entry.firingType === FiringType.SHARED);
        const share = group.volume.isZero() ? new Decimal(0) : result.cost.mul(dec(row.volumeCm3)).div(group.volume);
        if (f) { f.occupancy = fmt(result.occupancy); f.batches = fmt(result.batches); f.cost = fmt(share); }
        row.firingCost = fmt(dec(row.firingCost).plus(share));
      }
    }

    if (!cyclesKnown) laborKnown = false;
    const materialCost = materialsKnown ? materialsTotal : null;
    const laborCost = laborKnown ? laborTotal : null;
    const firingCost = firingKnown ? firingTotal : null;
    const technicalCost = materialCost != null && laborCost != null && firingCost != null ? materialCost.plus(laborCost).plus(firingCost) : null;
    const adjustments = Array.isArray(settings?.dayAdjustments) ? settings!.dayAdjustments as any[] : [];
    const configuredDays = adjustments.reduce((sum: Decimal, item: any) => sum.plus(dec(item?.days ?? item)), new Decimal(0));
    const manualDays = dec(input.productionDays ?? 0);
    if (manualDays.isNegative()) throw new BadRequestException('Los días adicionales no pueden ser negativos');
    const rawProductionDays = cyclesTotal.plus(configuredDays).plus(manualDays);
    const productionDays = cyclesKnown ? rawProductionDays : null;
    const otherCosts = productionDays == null ? null : productionDays.mul(dflt(settings?.rentPerDay, '110').plus(dflt(settings?.utilitiesPerDay, '10'))).plus(dflt(settings?.administrativeCost, '200'));
    const subtotal = technicalCost == null || otherCosts == null ? null : technicalCost.mul(factor).plus(otherCosts);
    const igvRate = dflt(settings?.igvRate, '0.18');
    const igvAmount = subtotal == null ? null : subtotal.mul(igvRate);
    const total = subtotal == null || igvAmount == null ? null : subtotal.plus(igvAmount);
    const minimumReferencePrice = technicalCost == null || otherCosts == null ? null : technicalCost.mul(minimumFactor).plus(otherCosts);
    const recommendedReferencePrice = technicalCost == null || otherCosts == null ? null : technicalCost.mul(defaultFactor).plus(otherCosts);
    return {
      status: warnings.length ? 'COST_INCOMPLETE' as CostStatusValue : 'READY' as CostStatusValue,
      warnings,
      lines: lineRows,
      totals: {
        materialCost: fmt(materialCost), laborCost: fmt(laborCost), firingCost: fmt(firingCost),
        technicalCost: fmt(technicalCost), productionFactor: fmt(factor), productionFactorMin: fmt(minimumFactor),
        productionFactorDefault: fmt(dec(defaultFactor)), productionDays: fmt(productionDays),
        otherCosts: fmt(otherCosts), subtotal: fmt(subtotal), igvRate: fmt(igvRate), igvAmount: fmt(igvAmount),
        total: fmt(total), unitPrice: total == null || quantityTotal.isZero() ? null : fmt(total.div(quantityTotal)),
        minimumReferencePrice: fmt(minimumReferencePrice), recommendedReferencePrice: fmt(recommendedReferencePrice),
        quantity: fmt(quantityTotal), hoursPerCycle: fmt(hoursPerCycle),
        geometricVolumeCm3: dimensionsKnown ? fmt(geometricVolumeTotal) : null,
        operationalVolumeCm3: dimensionsKnown ? fmt(operationalVolumeTotal) : null,
      },
    };
  }
}
