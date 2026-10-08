import type { Minor } from './money';

const D = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const U = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function group(n: number): string { // 0 < n < 1,000,000
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const pos = s.length - 1 - i;
    if (!d) continue;
    if (pos === 0 && d === 1 && n > 10) out += 'เอ็ด';
    else if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else out += (D[d] ?? '') + (U[pos] ?? '');
  }
  return out;
}

function intText(n: number): string {
  if (n === 0) return 'ศูนย์';
  const chunks: number[] = [];
  while (n > 0) { chunks.unshift(n % 1_000_000); n = Math.floor(n / 1_000_000); }
  return chunks.map((c, i) => (c ? group(c) : '') + (i < chunks.length - 1 ? 'ล้าน' : '')).join('');
}

/** Amount in Thai words, as printed on Thai invoices: 1234.50 → หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์ */
export function bahtText(minor: Minor): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const baht = Math.floor(abs / 100);
  const satang = abs % 100;
  const body = `${intText(baht)}บาท${satang === 0 ? 'ถ้วน' : `${intText(satang)}สตางค์`}`;
  return neg ? `ลบ${body}` : body;
}
