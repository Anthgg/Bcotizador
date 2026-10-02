export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface QuotationCase {
  id: string;
  quantity: number;
  productTypes: unknown;
  dimensions: unknown;
  materials: unknown;
  moldCount: number;
  finalCost: number | null;
  estimatedCost: number | null;
  actualTime: number | null;
  estimatedTime: number | null;
}

export interface FiringCase {
  id: string;
  kilnId: string | null;
  kilnName: string | null;
  firingType: string;
  volumeCm3: number;
  capacityCm3: number;
  realCost: number | null;
  estimatedCost: number | null;
  damagedPieces: number;
}

const numberFrom = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const jsonStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(jsonStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(jsonStrings);
  return typeof value === "string" ? [value.trim().toLocaleLowerCase()].filter(Boolean) : [];
};

const jsonNumber = (value: unknown): number | null => {
  const objects = Array.isArray(value) ? value : [value];
  const measures = objects.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const values = Object.values(item as Record<string, unknown>)
      .map(numberFrom)
      .filter((entry): entry is number => entry != null && entry > 0);
    return values.length ? [values.reduce((acc, entry) => acc * entry, 1)] : [];
  });
  return measures.length ? measures.reduce((sum, measure) => sum + measure, 0) / measures.length : null;
};

export function quotationSimilarity(
  target: Omit<QuotationCase, "id" | "finalCost" | "estimatedCost" | "actualTime" | "estimatedTime">,
  candidate: QuotationCase,
) {
  const q = numberFrom(target.quantity) ?? 0;
  const cq = numberFrom(candidate.quantity) ?? 0;
  if (q <= 0 || cq <= 0) return 0;
  const quantitySimilarity = Math.max(0, 1 - Math.abs(q - cq) / Math.max(q, cq));
  const targetTypes = new Set(jsonStrings(target.productTypes));
  const types = jsonStrings(candidate.productTypes);
  const typeSimilarity = targetTypes.size && types.length
    ? types.some((type) => targetTypes.has(type)) ? 1 : 0
    : 0.5;
  const targetMaterials = new Set(jsonStrings(target.materials));
  const materialList = jsonStrings(candidate.materials);
  const materialSimilarity = targetMaterials.size && materialList.length
    ? materialList.filter((material) => targetMaterials.has(material)).length /
      new Set([...targetMaterials, ...materialList]).size
    : 0.5;
  const targetVolume = jsonNumber(target.dimensions);
  const candidateVolume = jsonNumber(candidate.dimensions);
  const dimensionsSimilarity = targetVolume && candidateVolume
    ? Math.max(0, 1 - Math.abs(targetVolume - candidateVolume) / Math.max(targetVolume, candidateVolume))
    : 0.5;
  const moldSimilarity = target.moldCount === candidate.moldCount ? 1 : 0.65;
  return Number((quantitySimilarity * 0.35 + typeSimilarity * 0.2 + materialSimilarity * 0.2 + dimensionsSimilarity * 0.15 + moldSimilarity * 0.1).toFixed(4));
}

export function firingSimilarity(
  target: { firingType: string; volumeCm3: number; capacityCm3: number },
  candidate: FiringCase,
) {
  if (target.firingType !== candidate.firingType || target.volumeCm3 <= 0 || candidate.volumeCm3 <= 0) return 0;
  const volumeSimilarity = Math.max(0, 1 - Math.abs(target.volumeCm3 - candidate.volumeCm3) / Math.max(target.volumeCm3, candidate.volumeCm3));
  const capacitySimilarity = Math.max(0, 1 - Math.abs(target.capacityCm3 - candidate.capacityCm3) / Math.max(target.capacityCm3, candidate.capacityCm3));
  return Number((volumeSimilarity * 0.75 + capacitySimilarity * 0.25).toFixed(4));
}

export function confidenceForCases(count: number, averageSimilarity: number, consistency: number): Confidence {
  if (count >= 10 && averageSimilarity >= 0.75 && consistency >= 0.8) return "HIGH";
  if (count >= 5 && averageSimilarity >= 0.6 && consistency >= 0.65) return "MEDIUM";
  return "LOW";
}

export function summarizeCheaperKilnCases(cases: FiringCase[]) {
  const actual = cases.filter((item) => item.realCost != null && item.volumeCm3 > 0);
  const comparisons = actual.flatMap((item) => {
    const itemRate = (item.realCost ?? 0) / item.volumeCm3;
    const peers = actual
      .filter((other) => other.id !== item.id && other.kilnId !== item.kilnId && other.firingType === item.firingType)
      .filter((other) => Math.abs(other.volumeCm3 - item.volumeCm3) / Math.max(other.volumeCm3, item.volumeCm3) <= 0.2)
      .sort((a, b) => Math.abs(a.volumeCm3 - item.volumeCm3) - Math.abs(b.volumeCm3 - item.volumeCm3));
    const peer = peers[0];
    if (!peer || peer.realCost == null) return [];
    const peerRate = peer.realCost / peer.volumeCm3;
    return [{ item, peer, smallerKilnCheaper: item.capacityCm3 < peer.capacityCm3 && itemRate < peerRate }];
  });
  const cheaper = comparisons.filter((entry) => entry.smallerKilnCheaper);
  const consistency = comparisons.length ? cheaper.length / comparisons.length : 0;
  const averageSimilarity = comparisons.length
    ? comparisons.reduce((sum, entry) => sum + firingSimilarity({ firingType: entry.item.firingType, volumeCm3: entry.item.volumeCm3, capacityCm3: entry.peer.capacityCm3 }, entry.item), 0) / comparisons.length
    : 0;
  return {
    compared: comparisons.map((entry) => entry.item),
    cheaper: cheaper.map((entry) => entry.item),
    comparisons,
    consistency,
    averageSimilarity,
    confidence: confidenceForCases(comparisons.length, averageSimilarity, consistency),
  };
}

export function asNumber(value: unknown): number | null {
  return numberFrom(value);
}
