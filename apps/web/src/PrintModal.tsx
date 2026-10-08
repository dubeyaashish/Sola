import { useEffect, useRef, useState } from 'react';
import { getText } from './api';
import { useI18n, type Lang } from './i18n';
import { ErrorNote, Icon, Loading, Modal, cx, errMsg } from './ui';

type DocLang = 'th' | 'en' | 'both';
const SHEET = { a4: 794, slip: 302 } as const; // CSS px at 96dpi: 210 mm and 80 mm

/** Paper preview of server-generated print HTML (receipt, tax invoice, pawn ticket…): grey desk, white sheet, zoom, print, download. */
export function PrintModal({ path, title, defaultFormat, onClose }: { path: string; title: string; defaultFormat: 'a4' | 'slip'; onClose: () => void }) {
  const { t, lang: uiLang } = useI18n();
  const [lang, setLang] = useState<DocLang>(uiLang as Lang);
  const [format, setFormat] = useState<'a4' | 'slip'>(defaultFormat);
  const [html, setHtml] = useState('');
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const [h, setH] = useState(1123);
  const frame = useRef<HTMLIFrameElement>(null);
  const desk = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true; setErr(''); setHtml('');
    getText(`${path}?lang=${lang}&format=${format}&embed=1`).then((x) => live && setHtml(x)).catch((e) => live && setErr(errMsg(e)));
    return () => { live = false; };
  }, [path, lang, format]);

  const fit = () => { const w = (desk.current?.clientWidth ?? SHEET[format]) - 32; setZoom(Math.min(1.5, Math.max(0.4, w / SHEET[format]))); };
  useEffect(() => { fit(); }, [format, html]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/[^\w.-]+/g, '_')}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const seg = (on: boolean) => cx('chip', on && 'chip-on');

  return (
    <Modal size="xl" title={`${t('print.title')} · ${title}`} onClose={onClose}
      footer={<><button className="btn-outline" onClick={download} disabled={!html}><Icon name="download" /> {t('print.download')}</button>
        <button className="btn-primary" disabled={!html} onClick={() => frame.current?.contentWindow?.print()}><Icon name="print" /> {t('print.print')}</button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1.5" role="group" aria-label={t('print.language')}>{(['th', 'en', 'both'] as const).map((l) => <button key={l} className={seg(lang === l)} onClick={() => setLang(l)}>{l === 'both' ? 'TH + EN' : l.toUpperCase()}</button>)}</div>
        <div className="flex gap-1.5" role="group" aria-label={t('print.paper')}><button className={seg(format === 'a4')} onClick={() => setFormat('a4')}>A4</button><button className={seg(format === 'slip')} onClick={() => setFormat('slip')}>{t('print.slip')}</button></div>
        <div className="ml-auto flex items-center gap-1">
          <button className="icon-btn" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.4, +(zoom - 0.1).toFixed(2)))}><Icon name="minus" /></button>
          <span className="w-12 text-center text-xs tabular-nums text-ink-500">{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" aria-label="Zoom in" onClick={() => setZoom(Math.min(2, +(zoom + 0.1).toFixed(2)))}><Icon name="plus" /></button>
          <button className="chip ml-1" onClick={fit}>{t('print.fit')}</button>
        </div>
      </div>
      {err ? <ErrorNote message={err} /> : !html ? <Loading /> : (
        <div ref={desk} className="h-[58dvh] overflow-auto rounded-lg bg-ink-100 p-4">
          <div className="mx-auto bg-white shadow-page" style={{ width: SHEET[format], zoom }}>
            <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin allow-modals allow-scripts" style={{ width: SHEET[format], height: h, border: 0, display: 'block' }}
              onLoad={() => { const d = frame.current?.contentDocument; if (d) setH(Math.max(300, d.documentElement.scrollHeight)); }} />
          </div>
        </div>)}
    </Modal>
  );
}
