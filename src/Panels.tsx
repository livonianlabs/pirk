import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { Ad, AuditEntry, BETA, Message, Price, Report, SavedSearch, Thread, Tx, User, cover, money } from './core';
import { Key, useT } from './i18n';
import { AdCard, Empty, Login, fmtDate, statusKey, useApp } from './App';

function useData<T>(fn: () => Promise<T>) {
  const [data, set] = useState<T | null>(null); const { toast } = useApp(); const { t } = useT();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => fn().then(set).catch(() => toast(t('error'))), []);
  useEffect(() => { reload(); }, [reload]);
  return { data, reload };
}

// ---------------- cabinet ----------------
export function Cabinet() {
  const { t } = useT(); const { user } = useApp();
  if (!user) return <Login />;
  const items: [string, Key][] = [['', 'overview'], ['ads', 'myAds'], ['messages', 'messages'], ['favorites', 'favorites'], ['searches', 'savedSearches'], ['billing', 'billing'], ['profile', 'profile']];
  return <div className="wrap dash"><nav className="dash-nav">{items.map(([p, k]) => <NavLink key={p} to={`/cabinet/${p}`} end={p === ''}>{t(k)}</NavLink>)}</nav><div className="dash-main"><Routes>
    <Route index element={<Overview />} /><Route path="ads" element={<MyAds />} /><Route path="messages" element={<Messages />} /><Route path="messages/:tid" element={<Messages />} />
    <Route path="favorites" element={<Favorites />} /><Route path="searches" element={<Searches />} /><Route path="billing" element={<Billing />} /><Route path="profile" element={<Profile />} />
  </Routes></div></div>;
}
const Tile = ({ label, value }: { label: string; value: string | number }) => <div className="tile-stat"><small>{label}</small><strong>{value}</strong></div>;

function Overview() {
  const { t } = useT(); const { user, favs } = useApp(); const { data: ads } = useData(() => api.myAds()); const { data: th } = useData(() => api.threads());
  return <><h1>{user?.name}</h1><div className="stats">
    <Tile label={t('activeAds')} value={ads?.filter((a) => a.status === 'active').length ?? '…'} />
    <Tile label={t('totalViews')} value={ads?.reduce((s, a) => s + a.views, 0) ?? '…'} />
    <Tile label={t('favCount')} value={favs.length} /><Tile label={t('convos')} value={th?.length ?? '…'} />
  </div>
  <div className="sec-head"><h2>{t('myAds')}</h2><Link to="/post" className="btn btn-primary">＋ {t('post')}</Link></div>
  <AdList ads={ads?.slice(0, 4) ?? null} /></>;
}
function MyAds() { const { t } = useT(); const { data, reload } = useData(() => api.myAds()); return <><div className="sec-head"><h1>{t('myAds')}</h1><Link to="/post" className="btn btn-primary">＋ {t('post')}</Link></div><AdList ads={data} reload={reload} /></>; }

function AdList({ ads, reload }: { ads: Ad[] | null; reload?: () => void }) {
  const { t, lang } = useT(); const { toast } = useApp(); const nav = useNavigate(); const [boost, setBoost] = useState<string | null>(null); const [prices, setP] = useState<Price[]>([]); const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => { api.prices().then(setP); }, []);
  if (!ads) return <div className="skeleton" />;
  if (!ads.length) return <Empty title={t('emptyAds')}><Link to="/post" className="btn btn-primary">{t('post')}</Link></Empty>;
  const act = async (fn: () => Promise<void>) => { try { await fn(); reload?.(); } catch { toast(t('error')); } };
  const label: Record<string, Key> = { top: 'pTop', highlight: 'pHi', bump: 'pBump' };
  return <div className="rows">{ads.map((a) => <div className="row" key={a.id}>
    <Link to={`/ad/${a.id}`}><img src={cover(a)} alt="" /></Link>
    <div className="row-main"><Link to={`/ad/${a.id}`}><strong>{a.title}</strong></Link>
      <div className="muted"><span className={'st st-' + a.status}>{t(statusKey[a.status])}</span> · {money(a.price, t('negotiable'))} · {a.views} {t('views')} · {fmtDate(a.createdAt, lang)}</div>
      {a.status === 'rejected' && a.rejectReason && <div className="reject">{t('reason')}: {a.rejectReason}</div>}
    </div>
    {reload && <div className="row-act">
      <button className="btn btn-sm" onClick={() => nav(`/post/${a.id}`)}>{t('edit')}</button>
      {a.status === 'active' && <button className="btn btn-sm btn-accent" onClick={() => setBoost(boost === a.id ? null : a.id)}>{t('promote')}</button>}
      {a.status === 'active' && <button className="btn btn-sm" onClick={() => act(() => api.setStatus(a.id, 'paused'))}>{t('pause')}</button>}
      {a.status === 'paused' && <button className="btn btn-sm" onClick={() => act(() => api.setStatus(a.id, 'active'))}>{t('resume')}</button>}
      {(a.status === 'active' || a.status === 'paused') && <button className="btn btn-sm" onClick={() => act(() => api.setStatus(a.id, 'sold'))}>{t('markSold')}</button>}
      {(a.status === 'rejected' || a.status === 'expired') && <button className="btn btn-sm" onClick={() => act(() => api.setStatus(a.id, 'pending'))}>{t('resubmit')}</button>}
      {confirm === a.id ? <button className="btn btn-sm btn-danger" onClick={() => act(() => api.deleteAd(a.id))}>{t('delete')}?</button> : <button className="btn btn-sm" onClick={() => setConfirm(a.id)}>{t('delete')}</button>}
    </div>}
    {boost === a.id && <div className="boost">{prices.map((p) => <button key={p.code} className="boost-opt" onClick={() => act(async () => { await api.boost(a.id, p.code); setBoost(null); toast(t('applied')); })}>
      <strong>{t(label[p.code])}</strong><small>{BETA ? <><s>{money(p.amount, '')}</s> {t('betaFree')}</> : money(p.amount, '')}</small></button>)}</div>}
  </div>)}</div>;
}

function Messages() {
  const { tid } = useParams(); const { t, lang } = useT(); const { user, toast } = useApp(); const { data: threads } = useData(() => api.threads());
  const [msgs, setMsgs] = useState<Message[]>([]); const [body, setBody] = useState(''); const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => { if (tid) setMsgs(await api.messages(tid)); }, [tid]);
  useEffect(() => { load(); const i = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 5000); return () => clearInterval(i); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);
  const cur: Thread | undefined = threads?.find((x) => x.id === tid);
  return <><h1>{t('messages')}</h1>{threads && !threads.length ? <Empty title={t('noThreads')} /> : <div className="chat">
    <div className="chat-list">{threads?.map((th) => <NavLink key={th.id} to={`/cabinet/messages/${th.id}`}><strong>{th.otherName}</strong><small className="muted">{th.adTitle}</small></NavLink>)}</div>
    <div className="chat-main">{tid ? <>
      {cur && <Link className="chat-head" to={`/ad/${cur.adId}`}>{cur.adTitle} →</Link>}
      <div className="chat-msgs">{msgs.map((m) => <div key={m.id} className={'msg' + (m.senderId === user?.id ? ' mine' : '')}>{m.body}<small>{fmtDate(m.createdAt, lang)}</small></div>)}<div ref={end} /></div>
      <form className="chat-form" onSubmit={async (e) => { e.preventDefault(); const b = body.trim(); if (!b) return; try { await api.send(tid, b); setBody(''); await load(); } catch { toast(t('error')); } }}><input aria-label={t('typeMsg')} placeholder={t('typeMsg')} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /><button className="btn btn-primary">{t('send')}</button></form>
    </> : <Empty title={t('convos')} />}</div></div>}</>;
}
function Favorites() { const { t } = useT(); const { data } = useData(() => api.favorites()); return <><h1>{t('favorites')}</h1>{data && !data.length ? <Empty title={t('nothing')} /> : <div className="grid">{data?.map((a) => <AdCard key={a.id} ad={a} />)}</div>}</>; }
function Searches() {
  const { t, lang } = useT(); const { data, reload } = useData<SavedSearch[]>(() => api.saved());
  return <><h1>{t('savedSearches')}</h1>{data && !data.length ? <Empty title={t('nothing')}><Link className="btn btn-primary" to="/browse">{t('all')}</Link></Empty> : <div className="rows">{data?.map((s) => <div className="row" key={s.id}><div className="row-main"><Link to={`/browse?${s.query}`}><strong>{s.label}</strong></Link><div className="muted">{fmtDate(s.createdAt, lang)}</div></div><div className="row-act"><button className="btn btn-sm" onClick={async () => { await api.deleteSaved(s.id); reload(); }}>{t('delete')}</button></div></div>)}</div>}</>;
}
const TxTable = ({ rows, withUser }: { rows: Tx[]; withUser?: boolean }) => { const { t, lang } = useT(); const name: Record<string, Key> = { top: 'pTop', highlight: 'pHi', bump: 'pBump' };
  return <table className="tbl"><thead><tr><th>{t('date')}</th>{withUser && <th>{t('name')}</th>}<th>{t('service')}</th><th className="num">{t('listPrice')}</th><th className="num">{t('charged')}</th></tr></thead><tbody>{rows.map((x) => <tr key={x.id}><td>{fmtDate(x.createdAt, lang)}</td>{withUser && <td>{x.userName}</td>}<td>{name[x.code] ? t(name[x.code]) : x.code}</td><td className="num">{money(x.listPrice, '')}</td><td className="num">{money(x.charged, '')}</td></tr>)}</tbody></table>; };
function Billing() { const { t } = useT(); const { data } = useData(() => api.myTx()); return <><h1>{t('billing')}</h1>{BETA && <div className="beta">β · {t('betaT')}</div>}{data && !data.length ? <Empty title={t('noTx')} /> : data && <TxTable rows={data} />}<p><Link to="/pricing">{t('pricing')} →</Link></p></>; }
function Profile() {
  const { t } = useT(); const { user, refreshUser, toast } = useApp(); const [f, setF] = useState({ name: user?.name ?? '', city: user?.city ?? '', phone: user?.phone ?? '' });
  const exportData = async () => { const blob = new Blob([JSON.stringify(await api.exportMine(), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pirk-mani-dati.json'; a.click(); URL.revokeObjectURL(a.href); };
  return <><h1>{t('profile')}</h1><form className="panel form-narrow" onSubmit={async (e) => { e.preventDefault(); try { await api.updateMe(f); await refreshUser(); toast(t('saved')); } catch { toast(t('error')); } }}>
    <label>{t('email')}<input value={user?.email ?? ''} disabled /></label><label>{t('name')}<input required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
    <label>{t('city')}<input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label><label>{t('phone')}<input type="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
    <button className="btn btn-primary">{t('save')}</button></form>
    <div className="panel form-narrow"><p className="muted">{t('gdpr')}</p><div className="buy-row"><button className="btn btn-ghost" onClick={exportData}>{t('exportData')}</button><button className="btn btn-ghost" onClick={async () => { await api.signOut(); await refreshUser(); }}>{t('logout')}</button></div></div></>;
}

// ---------------- admin ----------------
export function Admin() {
  const { t } = useT(); const { user } = useApp();
  if (!user) return <Login />;
  if (user.role !== 'admin') return <div className="wrap"><Empty title={t('noAccess')} /></div>;
  const items: [string, Key][] = [['', 'overview'], ['queue', 'aQueue'], ['reports', 'aReports'], ['users', 'aUsers'], ['prices', 'aPrices'], ['revenue', 'aRevenue'], ['audit', 'aAudit']];
  return <div className="wrap dash"><nav className="dash-nav">{items.map(([p, k]) => <NavLink key={p} to={`/admin/${p}`} end={p === ''}>{t(k)}</NavLink>)}</nav><div className="dash-main"><Routes>
    <Route index element={<AdminHome />} /><Route path="queue" element={<Queue />} /><Route path="reports" element={<Reports />} /><Route path="users" element={<Users />} /><Route path="prices" element={<Prices />} /><Route path="revenue" element={<Revenue />} /><Route path="audit" element={<Audit />} />
  </Routes></div></div>;
}
function AdminHome() {
  const { t, lang } = useT(); const { data: ads } = useData(() => api.adminAds()); const { data: users } = useData(() => api.users()); const { data: reps } = useData(() => api.reports()); const { data: tx } = useData(() => api.allTx());
  const [table, setTable] = useState(false);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5); const key = d.toISOString().slice(0, 10); return { key, label: d.toLocaleDateString(lang === 'lv' ? 'lv-LV' : 'ru-RU', { day: 'numeric', month: 'short' }), n: ads?.filter((a) => a.createdAt.slice(0, 10) === key).length ?? 0 }; });
  const max = Math.max(1, ...days.map((d) => d.n));
  return <><h1>{t('overview')}</h1><div className="stats">
    <Tile label={t('kUsers')} value={users?.length ?? '…'} /><Tile label={t('kActive')} value={ads?.filter((a) => a.status === 'active').length ?? '…'} />
    <Tile label={t('kQueue')} value={ads?.filter((a) => a.status === 'pending').length ?? '…'} /><Tile label={t('kReports')} value={reps?.filter((r) => r.status === 'open').length ?? '…'} />
    <Tile label={t('kRevenue')} value={money(tx?.reduce((s, x) => s + x.charged, 0) ?? 0, '')} /><Tile label={t('kWould')} value={money(tx?.reduce((s, x) => s + x.listPrice, 0) ?? 0, '')} />
  </div>
  <div className="panel"><div className="sec-head"><h2>{t('adsPerDay')}</h2><button className="btn btn-sm" onClick={() => setTable(!table)}>{t('showTable')}</button></div>
    {table ? <table className="tbl"><thead><tr><th>{t('date')}</th><th className="num">{t('count')}</th></tr></thead><tbody>{days.map((d) => <tr key={d.key}><td>{d.label}</td><td className="num">{d.n}</td></tr>)}</tbody></table>
      : <div className="bars" role="img" aria-label={t('adsPerDay')}>{days.map((d) => <div className="bar-c" key={d.key} data-tip={`${d.label}: ${d.n}`} tabIndex={0}><div className="bar" style={{ height: `${d.n ? Math.max(4, (d.n / max) * 100) : 0}%` }} /></div>)}</div>}
    {!table && <div className="bars-axis"><span>{days[0].label}</span><span>{days[13].label}</span></div>}
  </div></>;
}
function Queue() {
  const { t, l: _l } = useT(); const { toast } = useApp(); const { data, reload } = useData(() => api.queue()); const [rej, setRej] = useState<Record<string, string>>({}); void _l;
  const act = async (id: string, ok: boolean) => { try { await api.moderate(id, ok, rej[id]); reload(); } catch { toast(t('error')); } };
  return <><h1>{t('aQueue')} <span className="muted">{data?.length ?? ''}</span></h1>{data && !data.length ? <Empty title={t('queueEmpty')} /> : <div className="rows">{data?.map((a) => <div className="row row-mod" key={a.id}>
    <img src={cover(a)} alt="" /><div className="row-main"><strong>{a.title}</strong><div>{money(a.price, t('negotiable'))} · {a.city} · {a.ownerName}</div><p className="muted">{a.description}</p>
      <input placeholder={t('rejectReason')} aria-label={t('rejectReason')} value={rej[a.id] ?? ''} onChange={(e) => setRej({ ...rej, [a.id]: e.target.value })} /></div>
    <div className="row-act"><button className="btn btn-sm btn-accent" onClick={() => act(a.id, true)}>{t('approve')}</button><button className="btn btn-sm btn-danger" disabled={!rej[a.id]?.trim()} onClick={() => act(a.id, false)}>{t('reject')}</button></div></div>)}</div>}</>;
}
function Reports() {
  const { t, lang } = useT(); const { data, reload } = useData<Report[]>(() => api.reports()); const reasons: Record<string, Key> = { scam: 'rScam', illegal: 'rIllegal', spam: 'rSpam', other: 'rOther' };
  return <><h1>{t('aReports')}</h1>{data && !data.length ? <Empty title={t('queueEmpty')} /> : <div className="rows">{data?.map((r) => <div className="row" key={r.id}><div className="row-main"><Link to={`/ad/${r.adId}`}><strong>{r.adTitle}</strong></Link><div className="muted">{reasons[r.reason] ? t(reasons[r.reason]) : r.reason} · {fmtDate(r.createdAt, lang)} · {r.status}</div>{r.details && <p>{r.details}</p>}</div>
    {r.status === 'open' && <div className="row-act"><button className="btn btn-sm btn-accent" onClick={async () => { await api.resolveReport(r.id, 'resolved'); reload(); }}>{t('resolve')}</button><button className="btn btn-sm" onClick={async () => { await api.resolveReport(r.id, 'dismissed'); reload(); }}>{t('dismiss')}</button></div>}</div>)}</div>}</>;
}
function Users() {
  const { t, lang } = useT(); const { user } = useApp(); const { data, reload } = useData<User[]>(() => api.users());
  return <><h1>{t('aUsers')}</h1><table className="tbl"><thead><tr><th>{t('name')}</th><th>{t('date')}</th><th /></tr></thead><tbody>{data?.map((u) => <tr key={u.id}><td>{u.name} {u.role === 'admin' && <span className="st st-active">admin</span>} {u.banned && <span className="st st-rejected">{t('banned')}</span>}</td><td>{u.createdAt ? fmtDate(u.createdAt, lang) : ''}</td><td className="num">{u.id !== user?.id && <button className="btn btn-sm" onClick={async () => { await api.setBan(u.id, !u.banned); reload(); }}>{u.banned ? t('unban') : t('ban')}</button>}</td></tr>)}</tbody></table></>;
}
function Prices() {
  const { t } = useT(); const { toast } = useApp(); const { data, reload } = useData(() => api.prices()); const [edit, setEdit] = useState<Record<string, string>>({}); const name: Record<string, Key> = { top: 'pTop', highlight: 'pHi', bump: 'pBump' };
  return <><h1>{t('aPrices')}</h1><p className="muted">{t('publicNote')}</p><div className="rows">{data?.map((p) => <div className="row" key={p.code}><div className="row-main"><strong>{t(name[p.code])}</strong><div className="muted">{money(p.amount, '')}</div></div><div className="row-act"><input className="input-sm" type="number" step="0.01" min="0" aria-label={t(name[p.code])} value={edit[p.code] ?? p.amount} onChange={(e) => setEdit({ ...edit, [p.code]: e.target.value })} /><button className="btn btn-sm btn-accent" disabled={edit[p.code] == null || +edit[p.code] === p.amount || +edit[p.code] < 0} onClick={async () => { try { await api.setPrice(p.code, +edit[p.code]); setEdit({}); reload(); toast(t('saved')); } catch { toast(t('error')); } }}>{t('save')}</button></div></div>)}</div></>;
}
function Revenue() { const { t } = useT(); const { data } = useData(() => api.allTx()); return <><h1>{t('aRevenue')}</h1>{BETA && <div className="beta">β · {t('betaT')}</div>}{data && !data.length ? <Empty title={t('noTx')} /> : data && <TxTable rows={data} withUser />}</>; }
function Audit() { const { t, lang } = useT(); const { data } = useData<AuditEntry[]>(() => api.audit()); return <><h1>{t('aAudit')}</h1><table className="tbl"><thead><tr><th>{t('date')}</th><th>{t('action')}</th><th /></tr></thead><tbody>{data?.map((a) => <tr key={a.id}><td>{fmtDate(a.createdAt, lang)}</td><td>{a.action}</td><td className="muted">{[a.target, a.note].filter(Boolean).join(' · ')}</td></tr>)}</tbody></table></>; }
