/** Purity (fineness) is stored in basis points: 9650 = 96.50 %, 9999 = 99.99 %. */
export const PURITY_PRESETS = [
  { label: '99.99%', bp: 9999 },
  { label: '96.5%', bp: 9650 },
  { label: '90%', bp: 9000 },
  { label: '18K (75%)', bp: 7500 },
  { label: '14K (58.5%)', bp: 5850 },
  { label: '9K (37.5%)', bp: 3750 },
] as const;

export const karatToBp = (k: number): number => Math.round((k / 24) * 10000);
export const bpToKarat = (bp: number): number => (bp / 10000) * 24;
export const percentToBp = (p: number): number => Math.round(p * 100);
export const bpToPercent = (bp: number): number => bp / 100;
export const isValidPurityBp = (bp: number): boolean => Number.isInteger(bp) && bp > 0 && bp <= 10000;
