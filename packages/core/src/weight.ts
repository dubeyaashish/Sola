/** Weight is stored as integer milligrams. */
export const MG_PER_GRAM = 1000;
/** Thai baht-weight (บาท) — the customary gold trading unit. */
export const MG_PER_BAHT = 15244;

export const gramsToMg = (g: number | string): number => {
  const n = Number(g);
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`invalid weight: ${g}`);
  return Math.round(n * MG_PER_GRAM);
};
export const mgToGrams = (mg: number): number => mg / MG_PER_GRAM;
export const mgToBaht = (mg: number): number => mg / MG_PER_BAHT;
export const bahtToMg = (b: number): number => Math.round(b * MG_PER_BAHT);
export const formatGrams = (mg: number): string => (mg / MG_PER_GRAM).toFixed(3);
