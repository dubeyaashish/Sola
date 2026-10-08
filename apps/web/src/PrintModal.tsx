import { useEffect, useRef, useState } from 'react';
import { getText } from './api';
import { useI18n, type Lang } from './i18n';
import { Icon, Modal, errMsg } from './ui';

type DocLang = 'th' | 'en' | 'both';

/**
 * Previews server-generated print HTML (receipt, tax invoice, pawn ticket…) and prints or downloads it.
 * `path` is an API path without query; language and paper size are chosen here.
 */
export function PrintModal({ path, title, defaultFormat, onClose }: { path: string; title: string; defaultFormat: 'a4' | 'slip'; onClose: () => void }) {
  const { t, lang: uiLang } = useI18n();
  const [lang, setLang] = useState<DocLang>(uiLang as Lang);
  const [format, setFormat] = useState<'a4' | 'slip'>(defaultFormat);
  const [html, setHtml] = useState('');
  const [err, setErr] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let live = true;
    setErr('');
    getText(`${path}?lang=${lang}&format=${format}&embed=1`).then((h) => live && setHtml(h)).catch((e) => live && setErr(errMsg(e)));
    return () => { live = false; };
  }, [path, lang, format]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^\w.-]+/g, '_')}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Modal wide title={<>{t('print.title')}: {title}</>} onClose={onClose}
      foot={<>
        <button className="btn" onClick={download} disabled={!html}>{t('print.download')}</button>
        <button className="btn primary" disabled={!html} onClick={() => frame.current?.contentWindow?.print()}><Icon name="print" /> {t('print.print')}</button>
      </>}>
      <div className="row center" style={{ marginBottom: 10 }}>
        <div className="lang" role="group" aria-label={t('print.language')}>
          {(['th', 'en', 'both'] as const).map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l === 'both' ? 'TH+EN' : l.toUpperCase()}</button>)}
        </div>
        <div className="lang" role="group" aria-label={t('print.paper')}>
          <button className={format === 'a4' ? 'on' : ''} onClick={() => setFormat('a4')}>A4</button>
          <button className={format === 'slip' ? 'on' : ''} onClick={() => setFormat('slip')}>{t('print.slip')}</button>
        </div>
      </div>
      {err ? <div className="alert err">{err}</div> : <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin allow-modals allow-scripts" style={{ width: '100%', height: '60dvh', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />}
    </Modal>
  );
}
