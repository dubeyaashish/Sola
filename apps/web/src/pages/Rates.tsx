import { useEffect, useState } from 'react';
import { MG_PER_BAHT } from '@sola/core';
import { get, post } from '../api';
import { Card, Field, baht, toMinor, useAction } from '../ui';

const perBaht = (perGram: number) => Math.round((perGram * MG_PER_BAHT * 9650) / 1e7); // per baht-weight @96.5%

export function Rates({ user }: { user: any }) {
  const [cur, setCur] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [f, setF] = useState({ announcementNo: '', barBuy: '', barSell: '', ornamentBuy: '', ornamentSell: '' });
  const { run, busy, banner } = useAction();
  const load = () => { get('/rates/current').then(setCur); get('/rates').then(setHist); };
  useEffect(load, []);
  const canSet = user.permissions.includes('rate.set');
  const k = (key: keyof typeof f, label: string) => <Field label={label}><input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} /></Field>;
  return (
    <>
      <Card title="ราคาปัจจุบัน · Current rate (ต่อบาททองคำ 96.5%)">
        {cur ? <div className="grid3">
          <div><div className="muted">ทองแท่ง รับซื้อ / ขายออก</div><div className="big">{baht(perBaht(cur.barBuyPerGram))} / {baht(perBaht(cur.barSellPerGram))}</div></div>
          <div><div className="muted">ทองรูปพรรณ รับซื้อ / ขายออก</div><div className="big">{baht(perBaht(cur.buyPerGram))} / {baht(perBaht(cur.sellPerGram))}</div></div>
          <div className="muted">{cur.source}{cur.announcementNo ? ` #${cur.announcementNo}` : ''}<br />{new Date(cur.effectiveAt).toLocaleString()} · {cur.setBy}</div>
        </div> : <div className="banner err">ยังไม่ได้ตั้งราคา · no rate set</div>}
      </Card>
      {canSet && <Card title="ปรับราคา (ตามประกาศสมาคมฯ) · Update from announcement">
        <div className="row">{k('announcementNo', 'ครั้งที่')}{k('barBuy', 'แท่ง รับซื้อ')}{k('barSell', 'แท่ง ขายออก')}{k('ornamentBuy', 'รูปพรรณ รับซื้อ')}{k('ornamentSell', 'รูปพรรณ ขายออก')}</div>
        {banner}
        <button className="primary" disabled={busy} onClick={() => run(() => post('/rates/association', {
          announcementNo: f.announcementNo || undefined, barBuy: toMinor(f.barBuy), barSell: toMinor(f.barSell), ornamentBuy: toMinor(f.ornamentBuy), ornamentSell: toMinor(f.ornamentSell),
        }), (r: any) => (r.changed ? 'อัปเดตราคาแล้ว' : 'ราคาไม่เปลี่ยน')).then(load)}>อัปเดต</button>
      </Card>}
      <Card title="ประวัติ · History"><table><thead><tr><th>เวลา</th><th>แท่ง ซื้อ/ขาย</th><th>รูปพรรณ ซื้อ/ขาย</th><th>แหล่ง</th></tr></thead><tbody>
        {hist.map((h) => <tr key={h.id}><td>{new Date(h.effectiveAt).toLocaleString()}</td><td>{baht(perBaht(h.barBuyPerGram))} / {baht(perBaht(h.barSellPerGram))}</td>
          <td>{baht(perBaht(h.buyPerGram))} / {baht(perBaht(h.sellPerGram))}</td><td>{h.source} {h.setBy}</td></tr>)}
      </tbody></table></Card>
    </>
  );
}
