import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';

const defaults = {
  id: 'default',
  glazeDefaultPct: '0.15', separationXcm: '3', separationYcm: '3', separationZcm: '3',
  productionFactorDefault: '3', productionFactorMin: '2', igvRate: '0.18',
  rentPerDay: '110', utilitiesPerDay: '10', administrativeCost: '200',
  hoursPerCycle: '8', validityDays: 30, dayAdjustments: [],
};
const writable = new Set(Object.keys(defaults).filter(key => key !== 'id'));

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}
  async get() { return { data: (await this.prisma.commercialSettings.findUnique({ where: { id: 'default' } })) ?? defaults }; }
  async update(body: Record<string, any>, actorId: string) {
    const data: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!writable.has(key)) continue;
      data[key] = value;
    }
    if (Object.keys(data).length === 0) return this.get();
    return this.prisma.$transaction(async tx => {
      const before = await tx.commercialSettings.findUnique({ where: { id: 'default' } });
      const after = await tx.commercialSettings.upsert({
        where: { id: 'default' },
        create: { ...defaults, ...data } as any,
        update: data,
      });
      await this.audit.write(actorId, before ? 'UPDATE' : 'CREATE', 'CommercialSettings', 'default', before ?? defaults, after, tx);
      return { data: after };
    });
  }
}
