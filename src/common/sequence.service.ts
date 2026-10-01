import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "./prisma.service";

export type SequenceKey =
  | "PRODUCT"
  | "CUSTOMER"
  | "WORKER"
  | "TECHNIQUE"
  | "KILN"
  | "MOVEMENT"
  | "QUOTATION";
type Db = PrismaService | Prisma.TransactionClient;
type SequenceRow = {
  prefix: string;
  padding: number;
  yearly: boolean;
  currentYear: number | null;
  lastValue: number;
};

export const SEQUENCE_DEFAULTS: Record<
  SequenceKey,
  { label: string; prefix: string; yearly: boolean }
> = {
  QUOTATION: { label: "Cotizaciones", prefix: "CTZ", yearly: true },
  PRODUCT: { label: "Productos", prefix: "PRD", yearly: false },
  CUSTOMER: { label: "Clientes", prefix: "CLI", yearly: false },
  WORKER: { label: "Trabajadores", prefix: "TRB", yearly: false },
  TECHNIQUE: { label: "Técnicas", prefix: "TEC", yearly: false },
  KILN: { label: "Hornos", prefix: "HOR", yearly: false },
  MOVEMENT: {
    label: "Movimientos de inventario",
    prefix: "MOV",
    yearly: false,
  },
};

/** Current calendar year in Lima, where the workshop issues its documents. */
export function documentYear(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      year: "numeric",
    }).format(now),
  );
}

export function formatSequenceCode(input: {
  prefix: string;
  padding: number;
  yearly: boolean;
  year?: number | null;
  value: number;
}): string {
  const number = String(input.value);
  const padded = number.padStart(Math.max(input.padding, number.length), "0");
  return input.yearly
    ? `${input.prefix}-${input.year}-${padded}`
    : `${input.prefix}-${padded}`;
}

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Atomically reserves the next code. Run it inside the transaction that inserts the row. */
  async next(key: SequenceKey, db: Db = this.prisma): Promise<string> {
    const year = documentYear();
    let rows = await this.increment(key, year, db);
    if (!rows.length) {
      const defaults = SEQUENCE_DEFAULTS[key];
      await db.$executeRaw`INSERT INTO "NumberSequence" ("key", "label", "prefix", "padding", "yearly", "lastValue") VALUES (${key}, ${defaults.label}, ${defaults.prefix}, 6, ${defaults.yearly}, 0) ON CONFLICT ("key") DO NOTHING`;
      rows = await this.increment(key, year, db);
    }
    const row = rows[0];
    return formatSequenceCode({
      prefix: row.prefix,
      padding: row.padding,
      yearly: row.yearly,
      year: row.currentYear ?? year,
      value: row.lastValue,
    });
  }

  /** The code the next record would receive, without reserving it. */
  preview(row: SequenceRow, now = new Date()): string {
    const year = documentYear(now);
    const value =
      row.yearly && row.currentYear !== year ? 1 : row.lastValue + 1;
    return formatSequenceCode({
      prefix: row.prefix,
      padding: row.padding,
      yearly: row.yearly,
      year,
      value,
    });
  }

  private increment(key: SequenceKey, year: number, db: Db) {
    return db.$queryRaw<SequenceRow[]>`
      UPDATE "NumberSequence"
         SET "lastValue" = CASE WHEN "yearly" AND COALESCE("currentYear", -1) <> ${year} THEN 1 ELSE "lastValue" + 1 END,
             "currentYear" = CASE WHEN "yearly" THEN ${year} ELSE "currentYear" END,
             "updatedAt" = CURRENT_TIMESTAMP
       WHERE "key" = ${key}
   RETURNING "prefix", "padding", "yearly", "currentYear", "lastValue"`;
  }
}
