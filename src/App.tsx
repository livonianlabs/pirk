import { createContext, FormEvent, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { Ad, AdDraft, BETA, BRAND, CATEGORIES, CITIES, Filter, Lang, Price, PriceChange, catById, cover, isHi, isTop, money, parseQuery, priceInsight, subById, Status, User } from './core';
import { Key, LangCtx, useT } from './i18n';
import { Admin, Cabinet } from './Panels';

const MapView = lazy(() => import('./MapView'));

// ---------- app state ----------
interface Ctx { user: User | null; refreshUser: () => Promise<void>; favs: string[]; toggleFav: (id: string) => Promise<void>; toast: (s: string) => void }
export const AppCtx = createContext<Ctx>({ user: null, refreshUser: async () => {}, favs: [], toggleFav: async () => {}, toast: () => {} });
export const useApp = () => useContext(AppCtx);
export const statusKey: Record<Status, Key> = { active: 'stActive', pending: 'stPending', paused: 'stPaused', rejected: 'stRejected', expired: 'stExpired', sold: 'stSold' };

export function fmtDate(iso: string, lang: Lang) { return new Date(iso).toLocaleDateString(lang === 'lv' ? 'lv-LV' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); }

// ---------- shared UI ----------
export function AdCard({ ad }: { ad: Ad }) {
  const { t, l } = useT(); const { favs, toggleFav } = useApp(); const fav = favs.includes(ad.id);
  const sub = subById(ad.category, ad.subcategory);
  const drop = ad.priceHistory.length > 0 && ad.price != null && (ad.priceHistory[ad.priceHistory.length - 1].price ?? 0) > ad.price;
  return (
    <article className={'card' + (isHi(ad) ? ' card-hi' : '')}>
      <Link to={`/ad/${ad.id}`} className="card-link" aria-label={ad.title}>
        <div className="card-img"><img src={cover(ad)} alt="" loading="lazy" />
          <div className="badges">{isTop(ad) && <span className="badge badge-top">{t('top')}</span>}{drop && <span className="badge">↓ {t('price')}</span>}</div>
        </div>
        <div className="card-body">
          <strong className="card-price">{ad.price === 0 ? t('free') : money(ad.price, t('negotiable'))}</strong>
          <h3>{ad.title}</h3>
          <p className="muted">{ad.city} · {l(sub?.name)}</p>
        </div>
      </Link>
      <button className={'fav' + (fav ? ' on' : '')} aria-pressed={fav} aria-label={t('favorites')} onClick={() => toggleFav(ad.id)}>{fav ? '♥' : '♡'}</button>
    </article>
  );
}
export const Empty = ({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) => <div className="empty"><div className="empty-mark">∅</div><h3>{title}</h3>{text && <p className="muted">{text}</p>}{children}</div>;

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, set] = useState<T | null>(null); const [error, setErr] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => { let live = true; setErr(false); run().then((d) => live && set(d)).catch(() => live && setErr(true)); return () => { live = false; }; }, [run]);
  return { data, error };
}
export const go = (nav: (s: string) => void, s: string) => { const d = document as Document & { startViewTransition?: (cb: () => void) => void }; if (d.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) d.startViewTransition(() => nav(s)); else nav(s); };

function toParams(p: ReturnType<typeof parseQuery>) { const u = new URLSearchParams(); if (p.q) u.set('q', p.q); if (p.category) u.set('category', p.category); if (p.subcategory) u.set('subcategory', p.subcategory); if (p.city) u.set('city', p.city); if (p.min != null) u.set('min', String(p.min)); if (p.max != null) u.set('max', String(p.max)); return u.toString(); }

function SmartSearch({ big, autoFocus, onDone }: { big?: boolean; autoFocus?: boolean; onDone?: () => void }) {
  const { t, l } = useT(); const nav = useNavigate(); const [v, setV] = useState('');
  const p = useMemo(() => parseQuery(v), [v]);
  const chips = [p.category && l(catById(p.category)?.name), p.subcategory && l(subById(p.category, p.subcategory)?.name), p.city, p.min != null && `${t('from')} ${p.min} €`, p.max != null && `${t('to')} ${p.max} €`].filter(Boolean) as string[];
  const submit = (e: FormEvent) => { e.preventDefault(); go(nav, `/browse?${toParams(p)}`); onDone?.(); };
  return (
    <form className={'smart' + (big ? ' smart-big' : '')} onSubmit={submit} role="search">
      <div className="smart-row">
        <span aria-hidden className="smart-ic">⌕</span>
        <input autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)} placeholder={t('search')} aria-label={t('searchShort')} />
        <button className="btn btn-primary">{t('searchShort')}</button>
      </div>
      {chips.length > 0 && <div className="chips" aria-live="polite"><span className="muted">{t('understood')}</span>{chips.map((c) => <span className="chip chip-on" key={c}>{c}</span>)}</div>}
    </form>
  );
}

function CommandPalette({ open, close }: { open: boolean; close: () => void }) {
  const { t, l } = useT(); const nav = useNavigate();
  if (!open) return null;
  return (
    <div className="palette-wrap" onClick={close} role="dialog" aria-modal="true" aria-label={t('cmdHint')}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <SmartSearch autoFocus onDone={close} />
        <div className="palette-list">
          {CATEGORIES.slice(0, 6).map((c) => <button key={c.id} onClick={() => { nav(`/browse?category=${c.id}`); close(); }}><span>{c.icon}</span>{l(c.name)}</button>)}
          <button onClick={() => { nav('/post'); close(); }}><span>＋</span>{t('post')}</button>
          <button onClick={() => { nav('/cabinet'); close(); }}><span>◐</span>{t('cabinet')}</button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang } = useT(); const { setLang } = useContext(LangCtx); const { user } = useApp(); const loc = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('pirk-theme') === 'dark' || (!localStorage.getItem('pirk-theme') && matchMedia('(prefers-color-scheme: dark)').matches));
  const [cmd, setCmd] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('pirk-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((c) => !c); } if (e.key === 'Escape') setCmd(false); }; addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []);
  useEffect(() => { scrollTo(0, 0); }, [loc.pathname]);
  return (
    <>
      {api.demo && <div className="demobar">{t('demoBar')}</div>}
      <header className="top"><div className="wrap top-in">
        <Link to="/" className="logo" aria-label={BRAND.name}>pirk<i>.</i></Link>
        <button className="cmd-btn" onClick={() => setCmd(true)}><span>⌕ {t('searchShort')}…</span><kbd>Ctrl K</kbd></button>
        <nav className="top-nav">
          <NavLink to="/pricing">{t('pricing')}</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin">{t('admin')}</NavLink>}
          <NavLink to="/cabinet">{user ? t('cabinet') : t('login')}</NavLink>
        </nav>
        <button className="icon-btn" onClick={() => setLang(lang === 'lv' ? 'ru' : 'lv')} aria-label="Language">{lang === 'lv' ? 'RU' : 'LV'}</button>
        <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="Theme">{dark ? '☀' : '☾'}</button>
        <Link to="/post" className="btn btn-primary hide-m">＋ {t('post')}</Link>
      </div></header>
      <main>{children}</main>
      <footer className="foot"><div className="wrap foot-in">
        <div><span className="logo">pirk<i>.</i></span><p className="muted">© 2026 Livonian Labs, Riga, Latvia · <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a></p></div>
        <nav><Link to="/pricing">{t('pricing')}</Link><Link to="/terms">{t('terms')}</Link><Link to="/privacy">{t('privacy')}</Link></nav>
      </div></footer>
      <nav className="tabbar" aria-label="Mobile">
        <NavLink to="/" end>⌂<span>{t('home')}</span></NavLink>
        <NavLink to="/browse">⌕<span>{t('searchShort')}</span></NavLink>
        <NavLink to="/post" className="tab-post">＋</NavLink>
        <NavLink to="/cabinet/favorites">♡<span>{t('favorites')}</span></NavLink>
        <NavLink to="/cabinet" end>◐<span>{t('cabinet')}</span></NavLink>
      </nav>
      <CommandPalette open={cmd} close={() => setCmd(false)} />
    </>
  );
}

// ---------- pages ----------
function Home() {
  const { t, l } = useT();
  const { data } = useAsync(() => api.search({ limit: 12 }), []);
  return (
    <>
      <section className="hero"><div className="aurora" aria-hidden /><div className="wrap hero-in">
        <h1>{t('heroA')}<br /><em>{t('heroB')}</em></h1>
        <p className="hero-sub">{t('heroSub')}</p>
        <SmartSearch big />
      </div></section>
      <section className="wrap sec">
        <h2>{t('categories')}</h2>
        <div className="bento">
          {CATEGORIES.map((c, i) => (
            <Link key={c.id} to={`/browse?category=${c.id}`} className={'tile' + (i < 2 ? ' tile-lg' : '')} style={{ '--h': c.hue } as React.CSSProperties}>
              <span className="tile-ic">{c.icon}</span><strong>{l(c.name)}</strong>
              <small>{c.subs.slice(0, 3).map((s) => l(s.name)).join(' · ')}</small>
            </Link>
          ))}
        </div>
      </section>
      <section className="wrap sec">
        <div className="sec-head"><h2>{t('fresh')}</h2><Link to="/browse">{t('seeAll')} →</Link></div>
        <div className="grid">{data?.items.map((a) => <AdCard key={a.id} ad={a} />) ?? Array.from({ length: 8 }, (_, i) => <div className="skeleton" key={i} />)}</div>
      </section>
      <section className="wrap sec why">
        {([['whyA', 'whyAt', '€'], ['whyB', 'whyBt', '≈'], ['whyC', 'whyCt', '🔒']] as [Key, Key, string][]).map(([a, b, ic]) => <div key={a} className="why-c"><span>{ic}</span><h3>{t(a)}</h3><p className="muted">{t(b)}</p></div>)}
      </section>
    </>
  );
}

const PAGE = 24;
function Browse() {
  const { t, l } = useT(); const { user, toast } = useApp(); const nav = useNavigate();
  const [sp, setSp] = useSearchParams(); const [view, setView] = useState<'grid' | 'map'>('grid');
  const [items, setItems] = useState<Ad[] | null>(null); const [total, setTotal] = useState(0);
  const key = sp.toString();
  const cat = catById(sp.get('category') ?? undefined);
  const filter = useMemo((): Filter => {
    const attrs: NonNullable<Filter['attrs']> = {};
    cat?.fields.filter((f) => f.filter).forEach((f) => {
      if (f.type === 'number') { const a = sp.get(f.key + '_min'), b = sp.get(f.key + '_max'); if (a || b) attrs[f.key] = { min: a ? +a : undefined, max: b ? +b : undefined }; }
      else if (sp.get(f.key)) attrs[f.key] = { eq: sp.get(f.key)! };
    });
    return { q: sp.get('q') ?? undefined, category: sp.get('category') ?? undefined, subcategory: sp.get('subcategory') ?? undefined, city: sp.get('city') ?? undefined,
      min: sp.get('min') ? +sp.get('min')! : undefined, max: sp.get('max') ? +sp.get('max')! : undefined, withPhoto: sp.get('photo') === '1', sort: (sp.get('sort') as Filter['sort']) ?? 'new', attrs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { let live = true; setItems(null); api.search({ ...filter, limit: view === 'map' ? 100 : PAGE }).then((r) => { if (live) { setItems(r.items); setTotal(r.total); } }).catch(() => { if (live) { setItems([]); toast(t('error')); } }); return () => { live = false; }; }, [filter, view]); // eslint-disable-line
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === 'category') { [...n.keys()].forEach((x) => { if (!['q', 'category', 'city', 'min', 'max', 'sort', 'photo'].includes(x)) n.delete(x); }); } setSp(n, { replace: true }); };
  const more = async () => { const r = await api.search({ ...filter, limit: PAGE, offset: items?.length ?? 0 }); setItems([...(items ?? []), ...r.items]); };
  const saveSearch = async () => { if (!user) return nav('/cabinet'); const label = [sp.get('q'), l(cat?.name), sp.get('city'), sp.get('max') && `≤ ${sp.get('max')} €`].filter(Boolean).join(', ') || t('all'); await api.addSaved(label, key); toast(t('saved')); };
  return (
    <div className="wrap browse">
      <aside className="filters">
        <label>{t('searchShort')}<input defaultValue={sp.get('q') ?? ''} key={'q' + sp.get('q')} onBlur={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} /></label>
        <label>{t('stepCat')}<select value={sp.get('category') ?? ''} onChange={(e) => set('category', e.target.value)}><option value="">{t('allCats')}</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{l(c.name)}</option>)}</select></label>
        {cat && <div className="chips">{cat.subs.map((s) => <button key={s.id} className={'chip' + (sp.get('subcategory') === s.id ? ' chip-on' : '')} onClick={() => set('subcategory', sp.get('subcategory') === s.id ? '' : s.id)}>{l(s.name)}</button>)}</div>}
        <label>{t('city')}<select value={sp.get('city') ?? ''} onChange={(e) => set('city', e.target.value)}><option value="">{t('allCities')}</option>{CITIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></label>
        <fieldset><legend>{t('price')}, €</legend><div className="range"><input type="number" min="0" placeholder={t('from')} aria-label={t('from')} value={sp.get('min') ?? ''} onChange={(e) => set('min', e.target.value)} /><input type="number" min="0" placeholder={t('to')} aria-label={t('to')} value={sp.get('max') ?? ''} onChange={(e) => set('max', e.target.value)} /></div></fieldset>
        {cat?.fields.filter((f) => f.filter).map((f) => f.type === 'number'
          ? <fieldset key={f.key}><legend>{l(f.label)}{f.suffix ? `, ${f.suffix}` : ''}</legend><div className="range"><input type="number" placeholder={t('from')} aria-label={t('from')} value={sp.get(f.key + '_min') ?? ''} onChange={(e) => set(f.key + '_min', e.target.value)} /><input type="number" placeholder={t('to')} aria-label={t('to')} value={sp.get(f.key + '_max') ?? ''} onChange={(e) => set(f.key + '_max', e.target.value)} /></div></fieldset>
          : f.type === 'select' ? <label key={f.key}>{l(f.label)}<select value={sp.get(f.key) ?? ''} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select></label>
            : <label key={f.key}>{l(f.label)}<input defaultValue={sp.get(f.key) ?? ''} onBlur={(e) => set(f.key, e.target.value)} /></label>)}
        <label className="check"><input type="checkbox" checked={sp.get('photo') === '1'} onChange={(e) => set('photo', e.target.checked ? '1' : '')} />{t('withPhoto')}</label>
        <button className="btn btn-ghost" onClick={() => setSp({})}>{t('clear')}</button>
      </aside>
      <section>
        <div className="browse-head">
          <h1>{l(cat?.name) || t('all')} <span className="muted">{items ? total : '…'}</span></h1>
          <div className="browse-tools">
            <button className="btn btn-ghost" onClick={saveSearch}>★ {t('saveSearch')}</button>
            <select aria-label={t('sort')} value={sp.get('sort') ?? 'new'} onChange={(e) => set('sort', e.target.value)}><option value="new">{t('sNew')}</option><option value="cheap">{t('sCheap')}</option><option value="expensive">{t('sExp')}</option></select>
            <div className="seg"><button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>{t('grid')}</button><button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>{t('map')}</button></div>
          </div>
        </div>
        {!items ? <div className="grid">{Array.from({ length: 6 }, (_, i) => <div className="skeleton" key={i} />)}</div>
          : !items.length ? <Empty title={t('nothing')} text={t('nothingT')} />
            : view === 'map' ? <Suspense fallback={<div className="skeleton map" />}><MapView ads={items} /></Suspense>
              : <><div className="grid">{items.map((a) => <AdCard key={a.id} ad={a} />)}</div>{items.length < total && <div className="center"><button className="btn btn-ghost" onClick={more}>{t('more')}</button></div>}</>}
      </section>
    </div>
  );
}

function AdPage() {
  const { id = '' } = useParams(); const { t, l, lang } = useT(); const { user, favs, toggleFav, toast } = useApp(); const nav = useNavigate();
  const { data: res, error } = useAsync(() => api.ad(id).then((a) => ({ a })), [id]); const ad = res?.a;
  const { data: peers } = useAsync(() => ad ? api.search({ subcategory: ad.subcategory, category: ad.category, limit: 100 }) : Promise.resolve({ total: 0, items: [] as Ad[] }), [ad?.id]);
  const [phone, setPhone] = useState<string | null>(null); const [idx, setIdx] = useState(0); const [rep, setRep] = useState(false);
  const viewed = useRef('');
  useEffect(() => { if (ad && viewed.current !== ad.id) { viewed.current = ad.id; api.addView(ad.id); document.title = `${ad.title} · ${BRAND.name}`; } setPhone(null); setIdx(0); return () => { document.title = 'Pirk'; }; }, [ad]);
  if (error) return <div className="wrap"><Empty title={t('error')} /></div>;
  if (!res) return <div className="wrap sec"><div className="skeleton tall" /></div>;
  if (!ad) return <div className="wrap"><Empty title={t('notFound')}><Link className="btn btn-primary" to="/browse">{t('all')}</Link></Empty></div>;
  const c = catById(ad.category); const ins = peers ? priceInsight(ad, peers.items) : null; const pics = ad.photos.length ? ad.photos : [cover(ad)];
  const mine = user?.id === ad.ownerId; const fav = favs.includes(ad.id);
  const similar = peers?.items.filter((p) => p.id !== ad.id).slice(0, 4) ?? [];
  const contact = async () => { if (!user) return nav('/cabinet'); const tid = await api.openThread(ad); nav(`/cabinet/messages/${tid}`); };
  const share = async () => { await navigator.clipboard.writeText(location.href); toast(t('copied')); };
  return (
    <div className="wrap adp">
      <div className="crumbs"><Link to={`/browse?category=${ad.category}`}>{l(c?.name)}</Link> / <Link to={`/browse?category=${ad.category}&subcategory=${ad.subcategory}`}>{l(subById(ad.category, ad.subcategory)?.name)}</Link></div>
      <div className="adp-grid">
        <div>
          <div className="gallery"><img src={pics[idx]} alt={ad.title} /></div>
          {pics.length > 1 && <div className="thumbs">{pics.map((p, i) => <button key={p} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} aria-label={`${i + 1}`}><img src={p} alt="" /></button>)}</div>}
          <h1 className="adp-title">{ad.title}</h1>
          <p className="muted">{ad.city} · {t('published')} {fmtDate(ad.createdAt, lang)} · {ad.views} {t('views')}</p>
          {c && c.fields.some((f) => ad.attrs[f.key]) && <><h2>{t('details')}</h2><dl className="specs">{c.fields.filter((f) => ad.attrs[f.key]).map((f) => <div key={f.key}><dt>{l(f.label)}</dt><dd>{ad.attrs[f.key]}{f.suffix ? ` ${f.suffix}` : ''}</dd></div>)}</dl></>}
          <h2>{t('description')}</h2><p className="desc">{ad.description}</p>
          {ad.priceHistory.length > 0 && <><h2>{t('priceHistory')}</h2><ul className="hist">{ad.priceHistory.map((h) => <li key={h.at}><span className="muted">{fmtDate(h.at, lang)}</span> <s>{money(h.price, t('negotiable'))}</s></li>)}<li><strong>{money(ad.price, t('negotiable'))}</strong></li></ul></>}
        </div>
        <aside className="buybox">
          <div className="buy-price">{ad.price === 0 ? t('free') : money(ad.price, t('negotiable'))}</div>
          {ins && <div className={'insight ' + (ins.pct <= -5 ? 'good' : ins.pct >= 5 ? 'high' : '')}>
            <strong>{Math.abs(ins.pct) < 5 ? t('around') : `${Math.abs(ins.pct)}% ${ins.pct < 0 ? t('below') : t('above')}`}</strong>
            <small>{t('comparedWith')} {ins.n} {t('comparables')} {money(ins.median, '')}</small></div>}
          {mine ? <div className="note">{t('yourAd')} · <Link to={`/post/${ad.id}`}>{t('edit')}</Link></div> : <>
            {ad.showPhone && (phone ? <a className="btn btn-primary btn-full" href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
              : <button className="btn btn-primary btn-full" onClick={async () => { if (!user) return nav('/cabinet'); const p = await api.revealPhone(ad.id); if (p) setPhone(p); else toast(t('noPhone')); }}>{user ? t('showPhone') : t('loginToSee')}</button>)}
            <button className="btn btn-ghost btn-full" onClick={contact}>{t('write')}</button></>}
          <div className="buy-row">
            <button className="btn btn-ghost" aria-pressed={fav} onClick={() => toggleFav(ad.id)}>{fav ? '♥' : '♡'} {t('favorites')}</button>
            <button className="btn btn-ghost" onClick={share}>{t('share')}</button>
          </div>
          <div className="seller"><div className="avatar">{ad.ownerName.slice(0, 1)}</div><div><small className="muted">{t('seller')}</small><br /><strong>{ad.ownerName}</strong></div></div>
          {!mine && <button className="link-btn" onClick={() => setRep(true)}>⚑ {t('report')}</button>}
        </aside>
      </div>
      {similar.length > 0 && <section className="sec"><h2>{t('similar')}</h2><div className="grid">{similar.map((a) => <AdCard key={a.id} ad={a} />)}</div></section>}
      {rep && <ReportDialog adId={ad.id} close={() => setRep(false)} />}
    </div>
  );
}

function ReportDialog({ adId, close }: { adId: string; close: () => void }) {
  const { t } = useT(); const { toast } = useApp(); const [reason, setR] = useState('scam'); const [d, setD] = useState('');
  return <div className="palette-wrap" role="dialog" aria-modal="true" aria-label={t('report')} onClick={close}><form className="palette dialog" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); try { await api.report(adId, reason, d); toast(t('reportThanks')); close(); } catch { toast(t('error')); } }}>
    <h2>{t('report')}</h2>
    <label>{t('reason')}<select value={reason} onChange={(e) => setR(e.target.value)}><option value="scam">{t('rScam')}</option><option value="illegal">{t('rIllegal')}</option><option value="spam">{t('rSpam')}</option><option value="other">{t('rOther')}</option></select></label>
    <label>{t('reportDetails')}<textarea rows={3} maxLength={1000} value={d} onChange={(e) => setD(e.target.value)} /></label>
    <div className="buy-row"><button type="button" className="btn btn-ghost" onClick={close}>{t('cancel')}</button><button className="btn btn-primary">{t('send')}</button></div>
  </form></div>;
}

const emptyDraft: AdDraft = { title: '', description: '', price: null, category: '', subcategory: '', city: 'Rīga', attrs: {}, photos: [], showPhone: true };
function Post() {
  const { id } = useParams(); const { t, l } = useT(); const { user, toast } = useApp(); const nav = useNavigate();
  const [d, setD] = useState<AdDraft>(() => { if (id) return emptyDraft; try { return JSON.parse(localStorage.getItem('pirk-draft') ?? 'null') ?? emptyDraft; } catch { return emptyDraft; } });
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [priceMode, setPM] = useState<'price' | 'free' | 'none'>('price'); const [drag, setDrag] = useState(false);
  useEffect(() => { if (id) api.ad(id).then((a) => { if (a) { setD({ title: a.title, description: a.description, price: a.price, category: a.category, subcategory: a.subcategory, city: a.city, attrs: a.attrs, photos: a.photos, showPhone: a.showPhone }); setPM(a.price === 0 ? 'free' : a.price == null ? 'none' : 'price'); setStep(1); } }); }, [id]);
  useEffect(() => { if (!id) { try { localStorage.setItem('pirk-draft', JSON.stringify({ ...d, photos: [] })); } catch { /* draft autosave is best-effort */ } } }, [d, id]);
  const cat = catById(d.category);
  if (!user) return <Login />;
  const up = (p: Partial<AdDraft>) => setD((x) => ({ ...x, ...p }));
  const addFiles = async (files: FileList | null) => {
    if (!files) return; setBusy(true);
    try { const urls = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).slice(0, 12 - d.photos.length).map((f) => api.upload(f))); setD((x) => ({ ...x, photos: [...x.photos, ...urls] })); } catch { toast(t('error')); }
    setBusy(false);
  };
  const infoOk = d.title.trim().length >= 3 && d.description.trim().length > 0 && d.city && (priceMode !== 'price' || (d.price != null && d.price > 0));
  const finalDraft = (): AdDraft => ({ ...d, title: d.title.trim(), price: priceMode === 'free' ? 0 : priceMode === 'none' ? null : d.price });
  const submit = async () => { setBusy(true); try { const nid = await api.saveAd(finalDraft(), id); localStorage.removeItem('pirk-draft'); nav('/cabinet/ads'); void nid; toast(t('saved')); } catch { toast(t('error')); setBusy(false); } };
  const steps: Key[] = ['stepCat', 'stepInfo', 'stepPhotos', 'stepDone'];
  const preview: Ad = { ...finalDraft(), id: 'preview', ownerId: '', ownerName: user.name, lat: null, lng: null, status: 'pending', views: 0, bumpedAt: '', createdAt: '', expiresAt: '', priceHistory: [] };
  return (
    <div className="wrap post">
      <ol className="stepper">{steps.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><span>{i < step ? '✓' : i + 1}</span>{t(s)}</li>)}</ol>
      <div className="post-grid"><div className="panel">
        {step === 0 && <><h1>{t('stepCat')}</h1><div className="cat-pick">{CATEGORIES.map((c) => <button key={c.id} className={d.category === c.id ? 'on' : ''} onClick={() => up({ category: c.id, subcategory: '', attrs: {} })}><span>{c.icon}</span>{l(c.name)}</button>)}</div>
          {cat && <><h2>{t('subcategory')}</h2><div className="chips">{cat.subs.map((s) => <button key={s.id} className={'chip' + (d.subcategory === s.id ? ' chip-on' : '')} onClick={() => { up({ subcategory: s.id }); setStep(1); }}>{l(s.name)}</button>)}</div></>}</>}
        {step === 1 && <><h1>{t('stepInfo')}</h1>
          <label>{t('title')} *<input maxLength={90} value={d.title} placeholder={t('titleHint')} onChange={(e) => up({ title: e.target.value })} /></label>
          <label>{t('description')} *<textarea rows={6} maxLength={5000} value={d.description} onChange={(e) => up({ description: e.target.value })} /></label>
          <div className="seg seg-wide"><button className={priceMode === 'price' ? 'on' : ''} onClick={() => setPM('price')}>{t('price')}</button><button className={priceMode === 'free' ? 'on' : ''} onClick={() => setPM('free')}>{t('giveFree')}</button><button className={priceMode === 'none' ? 'on' : ''} onClick={() => setPM('none')}>{t('noPrice')}</button></div>
          {priceMode === 'price' && <label>{t('price')}, € *<input type="number" min="0" step="0.01" value={d.price ?? ''} onChange={(e) => up({ price: e.target.value === '' ? null : +e.target.value })} /></label>}
          <label>{t('city')} *<select value={d.city} onChange={(e) => up({ city: e.target.value })}>{CITIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></label>
          <div className="form-2">{cat?.fields.map((f) => <label key={f.key}>{l(f.label)}{f.suffix ? `, ${f.suffix}` : ''}
            {f.type === 'select' ? <select value={d.attrs[f.key] ?? ''} onChange={(e) => up({ attrs: { ...d.attrs, [f.key]: e.target.value } })}><option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
              : <input type={f.type === 'number' ? 'number' : 'text'} min="0" value={d.attrs[f.key] ?? ''} onChange={(e) => up({ attrs: { ...d.attrs, [f.key]: e.target.value } })} />}</label>)}</div>
          <label className="check"><input type="checkbox" checked={d.showPhone} onChange={(e) => up({ showPhone: e.target.checked })} />{t('showPhoneOpt')}</label></>}
        {step === 2 && <><h1>{t('stepPhotos')}</h1>
          <label className={'drop' + (drag ? ' on' : '')} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} /><strong>{busy ? '…' : t('dropPhotos')}</strong><small className="muted">{t('photoHint')}</small></label>
          <div className="photo-row">{d.photos.map((p, i) => <div key={p} className="photo"><img src={p} alt="" /><button aria-label={t('delete')} onClick={() => up({ photos: d.photos.filter((_, j) => j !== i) })}>×</button></div>)}</div></>}
        {step === 3 && <><h1>{t('stepDone')}</h1><p className="muted">{t('modNote')}</p></>}
        <div className="post-nav">
          {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>← {t('back')}</button>}
          {step < 3 ? <button className="btn btn-primary" disabled={(step === 0 && !d.subcategory) || (step === 1 && !infoOk) || busy} onClick={() => setStep(step + 1)}>{t('next')} →</button>
            : <button className="btn btn-primary" disabled={busy} onClick={submit}>{id ? t('saveChanges') : t('publish')}</button>}
          {step === 1 && !infoOk && <small className="muted">{t('required')}</small>}
        </div>
      </div>
      <aside className="post-preview"><small className="muted">{t('preview')}</small><div className="preview-card"><img src={cover(preview)} alt="" /><div className="card-body"><strong className="card-price">{preview.price === 0 ? t('free') : money(preview.price, t('negotiable'))}</strong><h3>{d.title || t('titleHint')}</h3><p className="muted">{d.city}</p></div></div></aside></div>
    </div>
  );
}

export function Login() {
  const { t } = useT(); const { refreshUser, toast } = useApp(); const [email, setE] = useState(''); const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); try { const r = await api.signIn(email); if (r === 'sent') setSent(true); else await refreshUser(); } catch { toast(t('error')); } };
  return <div className="wrap login"><form className="panel" onSubmit={submit}><h1>{t('loginTitle')}</h1>
    {sent ? <p>{t('loginSent')}</p> : api.demo ? <button className="btn btn-primary btn-full">{t('loginDemo')}</button> : <><p className="muted">{t('loginSub')}</p><label>{t('email')}<input type="email" required autoComplete="email" value={email} onChange={(e) => setE(e.target.value)} /></label><button className="btn btn-primary btn-full">{t('loginBtn')}</button></>}
  </form></div>;
}

function Pricing() {
  const { t, lang } = useT(); const [prices, setP] = useState<Price[]>([]); const [changes, setC] = useState<PriceChange[]>([]); const [q, setQ] = useState<Record<string, number>>({ top: 1, highlight: 0, bump: 0 });
  useEffect(() => { api.prices().then(setP); api.priceChanges().then(setC); }, []);
  const info: Record<string, [Key, Key]> = { top: ['pTop', 'pTopT'], highlight: ['pHi', 'pHiT'], bump: ['pBump', 'pBumpT'] };
  const total = prices.reduce((s, p) => s + p.amount * (q[p.code] ?? 0), 0);
  return (
    <div className="wrap sec pricing">
      <h1 className="big">{t('pTitle')}</h1><p className="hero-sub">{t('pSub')}</p>
      {BETA && <div className="beta">β · {t('betaT')}</div>}
      <div className="price-grid">
        <div className="price-card price-free"><h3>{t('pFree')}</h3><div className="price-num">0 €</div><p>{t('pFreeT')}</p></div>
        {prices.map((p) => <div className="price-card" key={p.code}><h3>{t(info[p.code][0])}</h3><div className="price-num">{money(p.amount, '')}</div><small className="muted">{p.days ? `${p.days} ${t('days')}` : t('once')}</small><p>{t(info[p.code][1])}</p></div>)}
      </div>
      <p className="muted">{t('incl')}</p>
      <div className="panel calc"><h2>{t('calc')}</h2>
        {prices.map((p) => <div className="calc-row" key={p.code}><span>{t(info[p.code][0])}</span><div className="stepper-n"><button aria-label="-" onClick={() => setQ({ ...q, [p.code]: Math.max(0, (q[p.code] ?? 0) - 1) })}>−</button><b>{q[p.code] ?? 0}</b><button aria-label="+" onClick={() => setQ({ ...q, [p.code]: (q[p.code] ?? 0) + 1 })}>+</button></div><span>{money(p.amount * (q[p.code] ?? 0), '')}</span></div>)}
        <div className="calc-row calc-total"><strong>{t('total')}</strong><span /><strong>{money(Math.round(total * 100) / 100, '')}</strong></div>
      </div>
      <h2>{t('changes')}</h2>
      {changes.length ? <table className="tbl"><tbody>{changes.map((c) => <tr key={c.createdAt + c.code}><td>{fmtDate(c.createdAt, lang)}</td><td>{info[c.code] ? t(info[c.code][0]) : c.code}</td><td>{money(c.oldAmount, '—')} → <strong>{money(c.newAmount, '')}</strong></td></tr>)}</tbody></table> : <p className="muted">{t('noChanges')}</p>}
    </div>
  );
}

const LEGAL = {
  terms: { lv: ['Lietošanas noteikumi (melnraksts)', ['Pirk ir sludinājumu platforma: mēs nepiedalāmies darījumos starp pircējiem un pārdevējiem un negarantējam preču kvalitāti.', 'Aizliegts publicēt nelegālas preces, viltojumus, krāpnieciskus vai citu tiesības pārkāpjošus sludinājumus.', 'Sludinājumus automātiski pārbauda bots, kas izvērtē tekstu un cenu un šaubu gadījumā nodod tos cilvēkam. Bots pats neko nenoraida. Noraidīšanas gadījumā norādām iemeslu, un to var labot un iesniegt atkārtoti. Sludinājums ar vairākām sūdzībām tiek paslēpts līdz pārbaudei.', 'Par pārkāpumu var ziņot ar pogu katrā sludinājumā. Pārkāpēju kontus varam bloķēt.', 'Sludinājums ir aktīvs 60 dienas. Beta laikā visi pakalpojumi ir bez maksas.']], ru: ['Правила использования (черновик)', ['Pirk — площадка объявлений: мы не участвуем в сделках между покупателями и продавцами и не гарантируем качество товаров.', 'Запрещено публиковать незаконные товары, подделки, мошеннические объявления и объявления, нарушающие чужие права.', 'Объявления автоматически проверяет бот: он оценивает текст и цену и при сомнениях передаёт их человеку. Сам бот ничего не отклоняет. При отказе мы указываем причину, объявление можно исправить и подать повторно. Объявление с несколькими жалобами скрывается до проверки.', 'Сообщить о нарушении можно кнопкой в каждом объявлении. Аккаунты нарушителей могут быть заблокированы.', 'Объявление активно 60 дней. В бета-период все услуги бесплатны.']] },
  privacy: { lv: ['Privātuma politika (melnraksts)', ['Glabājam e-pastu, profila datus, sludinājumus, ziņas un (ja norādīts) tālruni, lai nodrošinātu pakalpojumu.', 'Tālrunis ir redzams tikai pieslēgtiem lietotājiem un tikai tad, ja to atļauj sludinājumā.', 'Nelietojam reklāmas sīkdatnes. Pieteikšanās sesija tiek glabāta tavā pārlūkā. Karšu attēli tiek ielādēti no OpenStreetMap, kas redz tavu IP adresi.', 'Vari lejupielādēt savus datus kabinetā un pieprasīt to dzēšanu, rakstot uz kontaktu e-pastu.']], ru: ['Политика конфиденциальности (черновик)', ['Мы храним e-mail, данные профиля, объявления, сообщения и (если указан) телефон, чтобы предоставлять сервис.', 'Телефон виден только вошедшим пользователям и только если это разрешено в объявлении.', 'Мы не используем рекламные cookie. Сессия входа хранится в твоём браузере. Изображения карты загружаются с OpenStreetMap, который видит твой IP-адрес.', 'Свои данные можно скачать в кабинете и запросить их удаление, написав на контактный e-mail.']] },
} as const;
function Legal({ doc }: { doc: 'terms' | 'privacy' }) { const { lang } = useT(); const [h, items] = LEGAL[doc][lang]; return <div className="wrap sec legal"><h1>{h}</h1><ol>{items.map((x) => <li key={x}>{x}</li>)}</ol></div>; }

// ---------- root ----------
export default function App() {
  const [lang, setLangS] = useState<Lang>(() => (localStorage.getItem('pirk-lang') as Lang) ?? (navigator.language.startsWith('ru') ? 'ru' : 'lv'));
  const setLang = (l: Lang) => { setLangS(l); localStorage.setItem('pirk-lang', l); document.documentElement.lang = l; };
  const [user, setUser] = useState<User | null>(null); const [favs, setFavs] = useState<string[]>([]); const [msg, setMsg] = useState('');
  const refreshUser = useCallback(async () => { const u = await api.me(); setUser(u); setFavs(u ? await api.favoriteIds() : []); }, []);
  useEffect(() => { refreshUser().catch(() => setUser(null)); }, [refreshUser]);
  const toast = useCallback((s: string) => { setMsg(s); setTimeout(() => setMsg(''), 2800); }, []);
  const toggleFav = useCallback(async (id: string) => {
    if (!user) { location.assign(import.meta.env.BASE_URL + 'cabinet'); return; }
    const on = !favs.includes(id); setFavs((f) => (on ? [id, ...f] : f.filter((x) => x !== id)));
    try { await api.toggleFavorite(id, on); } catch { setFavs((f) => (on ? f.filter((x) => x !== id) : [id, ...f])); }
  }, [user, favs]);
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <AppCtx.Provider value={{ user, refreshUser, favs, toggleFav, toast }}>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Shell><Routes>
            <Route path="/" element={<Home />} /><Route path="/browse" element={<Browse />} /><Route path="/ad/:id" element={<AdPage />} />
            <Route path="/post" element={<Post />} /><Route path="/post/:id" element={<Post />} />
            <Route path="/cabinet/*" element={<Cabinet />} /><Route path="/admin/*" element={<Admin />} />
            <Route path="/pricing" element={<Pricing />} /><Route path="/terms" element={<Legal doc="terms" />} /><Route path="/privacy" element={<Legal doc="privacy" />} />
            <Route path="*" element={<div className="wrap"><Empty title="404"><Link className="btn btn-primary" to="/">Pirk</Link></Empty></div>} />
          </Routes></Shell>
        </BrowserRouter>
        {msg && <div className="toast" role="status">{msg}</div>}
      </AppCtx.Provider>
    </LangCtx.Provider>
  );
}
