import { Prisma } from '../generated/prisma/client';
import { TechniqueRule } from '../generated/prisma/enums';
import { AuditService } from '../common/audit.service';

const techniques = [
  { code: 'TEC001', name: 'A mano', rule: TechniqueRule.UN_FACTOR, factor1: '15', factor2: null, cycleRate: '110' },
  { code: 'TEC002', name: 'Piezas en torno fácil', rule: TechniqueRule.DOS_FACTORES, factor1: '50', factor2: '100', cycleRate: '220' },
  { code: 'TEC003', name: 'Piezas en torno difícil', rule: TechniqueRule.DOS_FACTORES, factor1: '25', factor2: '100', cycleRate: '220' },
  { code: 'TEC004', name: 'Colada', rule: TechniqueRule.UN_FACTOR, factor1: '100', factor2: null, cycleRate: '220' },
  { code: 'TEC005', name: 'Armado de asa', rule: TechniqueRule.UN_FACTOR, factor1: '50', factor2: null, cycleRate: '110' },
  { code: 'TEC006', name: 'Fabricación de molde', rule: TechniqueRule.SIMPLE, factor1: '1', factor2: null, cycleRate: '250' },
  { code: 'TEC007', name: 'Vidriado por inmersión', rule: TechniqueRule.UN_FACTOR, factor1: '50', factor2: null, cycleRate: '110' },
  { code: 'TEC008', name: 'Vidriado por aspersión', rule: TechniqueRule.UN_FACTOR, factor1: '50', factor2: null, cycleRate: '110' },
  { code: 'TEC009', name: 'Vidriado a mano alzada', rule: TechniqueRule.UN_FACTOR, factor1: '50', factor2: null, cycleRate: '110' },
  { code: 'TEC010', name: 'Con ilustración', rule: TechniqueRule.UN_FACTOR, factor1: '50', factor2: null, cycleRate: '110' },
];
const kilns = [
  { code: 'HOR-CH', name: 'Horno chico', class: 'Chico', capacityCm3: '17000', lowRate: '90', highRate: '180' },
  { code: 'HOR-GR', name: 'Horno grande', class: 'Grande', capacityCm3: '200000', lowRate: '1000', highRate: '2000' },
];

export async function initializeLocalDefaults(tx: Prisma.TransactionClient, actorId: string, audit: AuditService) {
  const priorSettings = await tx.commercialSettings.findUnique({ where: { id: 'default' } });
  const settings = await tx.commercialSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  if (!priorSettings) await audit.write(actorId, 'CREATE', 'CommercialSettings', settings.id, null, settings, tx);
  for (const data of techniques) {
    const before = await tx.technique.findUnique({ where: { name: data.name } });
    const after = await tx.technique.upsert({ where: { name: data.name }, create: data, update: {} });
    if (!before) await audit.write(actorId, 'CREATE', 'Technique', after.id, null, after, tx);
  }
  for (const data of kilns) {
    const before = await tx.kiln.findUnique({ where: { name: data.name } });
    const after = await tx.kiln.upsert({ where: { name: data.name }, create: data, update: {} });
    if (!before) await audit.write(actorId, 'CREATE', 'Kiln', after.id, null, after, tx);
  }
}
