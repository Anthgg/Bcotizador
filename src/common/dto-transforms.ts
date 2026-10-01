import { Transform } from "class-transformer";

export function NumericField() {
  return Transform(({ value }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed))
      return value;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  });
}
