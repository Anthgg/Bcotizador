import { UBIGEO } from "./ubigeo.data";

export interface ResolvedUbigeo {
  ubigeoCode: string;
  department: string;
  province: string;
  district: string;
  country: string;
}

const districtIndex = new Map<string, ResolvedUbigeo>();
for (const [, department, provinces] of UBIGEO) {
  for (const [, province, districts] of provinces) {
    for (const [code, district] of districts)
      districtIndex.set(code, {
        ubigeoCode: code,
        department,
        province,
        district,
        country: "Perú",
      });
  }
}

/** Department, province, district and country are derived from the INEI district code. */
export function resolveUbigeo(
  code: string | null | undefined,
): ResolvedUbigeo | null {
  if (!code) return null;
  return districtIndex.get(code) ?? null;
}
