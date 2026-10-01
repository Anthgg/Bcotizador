import Decimal from "decimal.js";

export type UnitDimension =
  "mass" | "volume" | "length" | "area" | "count" | "day" | "hour";
export interface UnitDefinition {
  code: string;
  label: string;
  name: string;
  dimension: UnitDimension;
  factor: string;
}

/** Canonical units. `factor` converts to the smallest unit of the same dimension. */
export const UNITS: readonly UnitDefinition[] = [
  { code: "g", label: "g", name: "Gramo", dimension: "mass", factor: "1" },
  {
    code: "kg",
    label: "kg",
    name: "Kilogramo",
    dimension: "mass",
    factor: "1000",
  },
  {
    code: "ml",
    label: "ml",
    name: "Mililitro",
    dimension: "volume",
    factor: "1",
  },
  { code: "L", label: "L", name: "Litro", dimension: "volume", factor: "1000" },
  {
    code: "cm3",
    label: "cm³",
    name: "Centímetro cúbico",
    dimension: "volume",
    factor: "1",
  },
  {
    code: "cm",
    label: "cm",
    name: "Centímetro",
    dimension: "length",
    factor: "1",
  },
  {
    code: "cm2",
    label: "cm²",
    name: "Centímetro cuadrado",
    dimension: "area",
    factor: "1",
  },
  {
    code: "und",
    label: "und",
    name: "Unidad",
    dimension: "count",
    factor: "1",
  },
  { code: "dia", label: "día", name: "Día", dimension: "day", factor: "1" },
  { code: "hora", label: "hora", name: "Hora", dimension: "hour", factor: "1" },
];

const ALIASES: Record<string, string> = {
  g: "g",
  gr: "g",
  grs: "g",
  gramo: "g",
  gramos: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogramo: "kg",
  kilogramos: "kg",
  kilogram: "kg",
  ml: "ml",
  mililitro: "ml",
  mililitros: "ml",
  l: "L",
  lt: "L",
  lts: "L",
  litro: "L",
  litros: "L",
  cm3: "cm3",
  "cm³": "cm3",
  cc: "cm3",
  cm: "cm",
  centimetro: "cm",
  centimetros: "cm",
  cm2: "cm2",
  "cm²": "cm2",
  und: "und",
  unid: "und",
  unidad: "und",
  unidades: "und",
  unit: "und",
  units: "und",
  u: "und",
  pza: "und",
  pieza: "und",
  piezas: "und",
  dia: "dia",
  dias: "dia",
  day: "dia",
  days: "dia",
  hora: "hora",
  horas: "hora",
  h: "hora",
  hr: "hora",
  hrs: "hora",
};

const byCode = new Map(UNITS.map((unit) => [unit.code, unit]));

/** Returns the canonical unit code for a known alias, or null when the unit is unknown. */
export function normalizeUnit(value: unknown): string | null {
  if (value == null) return null;
  const key = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!key) return null;
  return ALIASES[key] ?? null;
}

export function unitDefinition(
  code: string | null | undefined,
): UnitDefinition | undefined {
  const canonical = normalizeUnit(code);
  return canonical ? byCode.get(canonical) : undefined;
}

export function unitLabel(code: string | null | undefined): string {
  return unitDefinition(code)?.label ?? String(code ?? "");
}

export function areUnitsCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = unitDefinition(a),
    right = unitDefinition(b);
  return !!left && !!right && left.dimension === right.dimension;
}

/** Converts a quantity between compatible units; returns null when the units cannot be converted. */
export function convertQuantity(
  quantity: Decimal.Value,
  from: string,
  to: string,
): Decimal | null {
  const source = unitDefinition(from),
    target = unitDefinition(to);
  if (!source || !target || source.dimension !== target.dimension) return null;
  return new Decimal(quantity).mul(source.factor).div(target.factor);
}
