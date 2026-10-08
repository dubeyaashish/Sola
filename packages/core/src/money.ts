/**
 * Money is always an integer count of minor units (e.g. satang / cents).
 * Never use floats for money. Products of several integers go through BigInt.
 */
export type Minor = number;

/** round-half-away-from-zero of (f1*f2*...*fn)/divisor, computed exactly. */
export function mulDiv(factors: number[], divisor: number): Minor {
  if (divisor === 0 || !Number.isInteger(divisor)) throw new RangeError('divisor must be a non-zero integer');
  let sign = Math.sign(divisor);
  let num = 1n;
  for (const f of factors) {
    if (!Number.isInteger(f)) throw new RangeError(`non-integer factor: ${f}`);
    sign *= Math.sign(f);
    num *= BigInt(Math.abs(f));
  }
  const den = BigInt(Math.abs(divisor));
  const q = (2n * num + den) / (2n * den);
  const out = sign * Number(q);
  if (!Number.isSafeInteger(out)) throw new RangeError('amount out of range');
  return out || 0;
}

export function parseMoney(input: string | number): Minor {
  const s = String(input).replace(/[,\s฿$]/g, '');
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) throw new RangeError(`invalid money: ${input}`);
  const neg = s.startsWith('-');
  const [i = '0', f = ''] = s.replace('-', '').split('.');
  const v = Number(i) * 100 + Number(f.padEnd(2, '0'));
  return neg ? -v : v;
}

export function formatMoney(minor: Minor): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}
