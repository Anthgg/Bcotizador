import { Prisma } from "../generated/prisma/client";
import { TechniqueRule } from "../generated/prisma/enums";
import { AuditService } from "../common/audit.service";
import type { SequenceKey } from "../common/sequence.service";

const techniques = [
  {
    name: "A mano",
    rule: TechniqueRule.UN_FACTOR,
    factor1: "15",
    factor2: null,
    cycleRate: "110",
  },
  {
    name: "Piezas en torno fácil",
    rule: TechniqueRule.DOS_FACTORES,
    factor1: "50",
    factor2: "100",
    cycleRate: "220",
  },
  {
    name: "Piezas en torno difícil",
    rule: TechniqueRule.DOS_FACTORES,
    factor1: "25",
    factor2: "100",
    cycleRate: "220",
  },
  {
    name: "Colada",
    rule: TechniqueRule.UN_FACTOR,
    factor1: "100",
    factor2: null,
    cycleRate: "220",
  },
  {
    name: "Armado de asa",
    rule: TechniqueRule.UN_FACTOR,
    factor1: "50",
    factor2: null,
    cycleRate: "110",
  },
  {
    name: "Fabricación de molde",
    rule: TechniqueRule.SIMPLE,
    factor1: "1",
    factor2: null,
    cycleRate: "250",
  },
  {
    name: "Vidriado por inmersión",
    rule: TechniqueRule.UN_FACTOR,
    factor1: "50",
    factor2: null,
    cycleRate: "110",
  },
  {
    name: "Vidriado por aspersión",
    rule: TechniqueRule.UN_FACTOR,
    factor1: "50",
    factor2: null,
    cycleRate: "110",
  },
  {
    name: "Vidriado a mano alzada",
    rule: TechniqueRule.UN_FACTOR,
    factor1: "50",
    factor2: null,
    cycleRate: "110",
  },
  {
    name: "Con ilustración",
    rule: TechniqueRule.UN_FACTOR,
    factor1: "50",
    factor2: null,
    cycleRate: "110",
  },
];
const kilns = [
  {
    name: "Horno chico",
    class: "Chico",
    capacityCm3: "17000",
    lowRate: "90",
    highRate: "180",
  },
  {
    name: "Horno grande",
    class: "Grande",
    capacityCm3: "200000",
    lowRate: "1000",
    highRate: "2000",
  },
];

/** System codes come from the shared sequences; without them (tests) rows are created without code. */
export async function initializeLocalDefaults(
  tx: Prisma.TransactionClient,
  actorId: string,
  audit: AuditService,
  nextCode?: (key: SequenceKey) => Promise<string>,
) {
  const priorSettings = await tx.commercialSettings.findUnique({
    where: { id: "default" },
  });
  const settings = await tx.commercialSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  if (!priorSettings)
    await audit.write(
      actorId,
      "CREATE",
      "CommercialSettings",
      settings.id,
      null,
      settings,
      tx,
    );
  for (const data of techniques) {
    const before = await tx.technique.findUnique({
      where: { name: data.name },
    });
    const code = !before && nextCode ? await nextCode("TECHNIQUE") : undefined;
    const after = await tx.technique.upsert({
      where: { name: data.name },
      create: { ...data, ...(code ? { code } : {}) },
      update: {},
    });
    if (!before)
      await audit.write(
        actorId,
        "CREATE",
        "Technique",
        after.id,
        null,
        after,
        tx,
      );
  }
  for (const data of kilns) {
    const before = await tx.kiln.findUnique({ where: { name: data.name } });
    const code = !before && nextCode ? await nextCode("KILN") : undefined;
    const after = await tx.kiln.upsert({
      where: { name: data.name },
      create: { ...data, ...(code ? { code } : {}) },
      update: {},
    });
    if (!before)
      await audit.write(actorId, "CREATE", "Kiln", after.id, null, after, tx);
  }
}
