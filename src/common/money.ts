import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const ZERO = new Decimal(0);
export const dec = (value: Decimal.Value | null | undefined): Decimal => {
  if (value === null || value === undefined || value === '') return ZERO;
  return new Decimal(value);
};
export const roundCommercial = (value: Decimal.Value, places = 2): Decimal =>
  new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
export const asAmount = (value: Decimal.Value, places = 6): string =>
  roundCommercial(value, places).toFixed(places);
export const ceil = (value: Decimal.Value): Decimal => new Decimal(value).ceil();
