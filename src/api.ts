// One data interface, two backends: Supabase when configured, a labelled local demo otherwise.
import { createClient } from '@supabase/supabase-js';
import { Ad, AdDraft, AuditEntry, CATEGORIES, CITIES, BotRule, Filter, Message, Price, PriceChange, Report, SavedSearch, Status, Thread, Tx, User, compressImage, strip, isTop } from './core';

export interface Api {
  demo: boolean;
  me(): Promise<User | null>;
  signIn(email: string): Promise<'sent' | 'in'>;
  signOut(): Promise<void>;
  updateMe(p: { name: string; city: string; phone: string }): Promise<void>;
  search(f: Filter): Promise<{ total: number; items: Ad[] }>;
  ad(id: string): Promise<Ad | null>;
  addView(id: string): Promise<void>;
  revealPhone(id: string): Promise<string | null>;
  myAds(): Promise<Ad[]>;
  saveAd(d: AdDraft, id?: string): Promise<string>;
  setStatus(id: string, s: Status): Promise<void>;
  deleteAd(id: string): Promise<void>;
  upload(file: File): Promise<string>;
  favorites(): Promise<Ad[]>;
  favoriteIds(): Promise<string[]>;
  toggleFavorite(id: string, on: boolean): Promise<void>;
  saved(): Promise<SavedSearch[]>;
  addSaved(label: string, query: string): Promise<void>;
  deleteSaved(id: string): Promise<void>;
  threads(): Promise<Thread[]>;
  messages(threadId: string): Promise<Message[]>;
  openThread(ad: Ad): Promise<string>;
  send(threadId: string, body: string): Promise<void>;
  report(adId: string, reason: string, details: string): Promise<void>;
  prices(): Promise<Price[]>;
  priceChanges(): Promise<PriceChange[]>;
  boost(adId: string, code: Price['code']): Promise<void>;
  myTx(): Promise<Tx[]>;
  exportMine(): Promise<object>;
  // admin
  queue(): Promise<Ad[]>;
  moderate(id: string, approve: boolean, reason?: string): Promise<void>;
  reports(): Promise<Report[]>;
  resolveReport(id: string, status: 'resolved' | 'dismissed'): Promise<void>;
  users(): Promise<User[]>;
  setBan(id: string, banned: boolean): Promise<void>;
  allTx(): Promise<Tx[]>;
  setPrice(code: string, amount: number): Promise<void>;
  audit(): Promise<AuditEntry[]>;
  adminAds(): Promise<Ad[]>;
  botEnabled(): Promise<boolean>;
  setBotEnabled(on: boolean): Promise<void>;
  botRules(): Promise<BotRule[]>;
  addBotRule(pattern: string, reason: string): Promise<void>;
  deleteBotRule(id: string): Promise<void>;
}

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// ---------------------------------------------------------------- Supabase
function supabaseApi(): Api {
  const sb = createClient(SB_URL!, SB_KEY!);
  const must = <T,>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const toAd = (r: any): Ad => ({
    id: r.id, ownerId: r.owner_id, ownerName: r.owner_name ?? r.profiles?.display_name ?? '', title: r.title, description: r.description,
    price: r.price == null ? null : Number(r.price), category: r.category, subcategory: r.subcategory, city: r.city, lat: r.lat, lng: r.lng,
    attrs: r.attrs ?? {}, photos: r.photos ?? [], showPhone: r.show_phone, status: r.status, rejectReason: r.reject_reason, views: r.views,
    topUntil: r.top_until, highlightUntil: r.highlight_until, bumpedAt: r.bumped_at, createdAt: r.created_at, expiresAt: r.expires_at, priceHistory: r.price_history ?? [], botNote: r.bot_note, modSource: r.mod_source,
  });
  const uid = async () => { const { data } = await sb.auth.getUser(); if (!data.user) throw new Error('auth'); return data.user.id; };
  const SEL = '*, profiles!ads_owner_id_fkey(display_name)';
  return {
    demo: false,
    async me() {
      const { data } = await sb.auth.getUser(); const u = data.user; if (!u) return null;
      const p: any = must(await sb.from('profiles').select('*').eq('id', u.id).single());
      const c: any = must(await sb.from('profile_contacts').select('phone').eq('user_id', u.id).maybeSingle());
      return { id: u.id, name: p.display_name, email: u.email ?? '', city: p.city, phone: c?.phone, role: p.role, banned: p.banned, createdAt: p.created_at };
    },
    async signIn(email) { must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL + 'cabinet' } })); return 'sent'; },
    async signOut() { await sb.auth.signOut(); },
    async updateMe(p) {
      const id = await uid();
      must(await sb.from('profiles').update({ display_name: p.name, city: p.city }).eq('id', id));
      must(await sb.from('profile_contacts').upsert({ user_id: id, phone: p.phone }));
    },
    async search(f) {
      const r: any = must(await sb.rpc('search_ads', {
        p_q: f.q || null, p_category: f.category || null, p_subcategory: f.subcategory || null, p_city: f.city || null, p_min: f.min ?? null, p_max: f.max ?? null,
        p_attrs: f.attrs ?? {}, p_with_photo: !!f.withPhoto, p_sort: f.sort ?? 'new', p_limit: f.limit ?? 24, p_offset: f.offset ?? 0,
      }));
      return { total: r.total, items: r.items.map(toAd) };
    },
    async ad(id) { const r = must(await sb.from('ads').select(SEL).eq('id', id).maybeSingle()); return r ? toAd(r) : null; },
    async addView(id) { await sb.rpc('add_view', { p_ad: id }); },
    async revealPhone(id) { return must(await sb.rpc('reveal_phone', { p_ad: id })) as string | null; },
    async myAds() { const id = await uid(); return (must(await sb.from('ads').select(SEL).eq('owner_id', id).order('created_at', { ascending: false })) as any[]).map(toAd); },
    async saveAd(d, id) {
      const city = CITIES.find((c) => c.name === d.city);
      const row = { title: d.title, description: d.description, price: d.price, category: d.category, subcategory: d.subcategory, city: d.city, lat: city?.lat, lng: city?.lng, attrs: d.attrs, photos: d.photos, show_phone: d.showPhone };
      if (id) { must(await sb.from('ads').update(row).eq('id', id)); return id; }
      return (must(await sb.from('ads').insert({ ...row, owner_id: await uid() }).select('id').single()) as any).id;
    },
    async setStatus(id, s) { must(await sb.from('ads').update({ status: s }).eq('id', id)); },
    async deleteAd(id) { must(await sb.from('ads').delete().eq('id', id)); },
    async upload(file) {
      const blob = await compressImage(file, 1600); const path = `${await uid()}/${crypto.randomUUID()}.webp`;
      must(await sb.storage.from('ad-photos').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' }));
      return sb.storage.from('ad-photos').getPublicUrl(path).data.publicUrl;
    },
    async favorites() { const r: any = must(await sb.from('favorites').select(`ads(${SEL})`).order('created_at', { ascending: false })); return r.map((x: any) => x.ads).filter(Boolean).map(toAd); },
    async favoriteIds() { const { data } = await sb.auth.getUser(); if (!data.user) return []; return (must(await sb.from('favorites').select('ad_id')) as any[]).map((x) => x.ad_id); },
    async toggleFavorite(id, on) { const user_id = await uid(); must(on ? await sb.from('favorites').insert({ user_id, ad_id: id }) : await sb.from('favorites').delete().eq('ad_id', id).eq('user_id', user_id)); },
    async saved() { return (must(await sb.from('saved_searches').select('*').order('created_at', { ascending: false })) as any[]).map((s) => ({ id: s.id, label: s.label, query: s.query, createdAt: s.created_at })); },
    async addSaved(label, query) { must(await sb.from('saved_searches').insert({ user_id: await uid(), label, query })); },
    async deleteSaved(id) { must(await sb.from('saved_searches').delete().eq('id', id)); },
    async threads() {
      const me = await uid();
      const r: any = must(await sb.from('threads').select('*, ads(title,photos), buyer:profiles!threads_buyer_id_fkey(display_name), seller:profiles!threads_seller_id_fkey(display_name)').order('updated_at', { ascending: false }));
      return r.map((t: any) => ({ id: t.id, adId: t.ad_id, adTitle: t.ads?.title ?? '', adPhoto: t.ads?.photos?.[0], otherName: t.buyer_id === me ? t.seller?.display_name : t.buyer?.display_name, updatedAt: t.updated_at }));
    },
    async messages(threadId) { return (must(await sb.from('messages').select('*').eq('thread_id', threadId).order('created_at')) as any[]).map((m) => ({ id: m.id, threadId: m.thread_id, senderId: m.sender_id, body: m.body, createdAt: m.created_at })); },
    async openThread(ad) {
      const me = await uid();
      const ex: any = must(await sb.from('threads').select('id').eq('ad_id', ad.id).eq('buyer_id', me).maybeSingle());
      if (ex) return ex.id;
      return (must(await sb.from('threads').insert({ ad_id: ad.id, buyer_id: me, seller_id: ad.ownerId }).select('id').single()) as any).id;
    },
    async send(thread_id, body) { must(await sb.from('messages').insert({ thread_id, body, sender_id: await uid() })); },
    async report(ad_id, reason, details) { const { data } = await sb.auth.getUser(); must(await sb.from('reports').insert({ ad_id, reason, details, reporter_id: data.user?.id ?? null })); },
    async prices() { return (must(await sb.from('prices').select('*')) as any[]).map((p) => ({ code: p.code, amount: Number(p.amount), days: p.days })); },
    async priceChanges() { return (must(await sb.from('price_changes').select('*').order('created_at', { ascending: false }).limit(50)) as any[]).map((p) => ({ code: p.code, oldAmount: p.old_amount == null ? null : Number(p.old_amount), newAmount: Number(p.new_amount), createdAt: p.created_at })); },
    async boost(id, code) { must(await sb.rpc('apply_boost', { p_ad: id, p_code: code })); },
    async myTx() { const me = await uid(); return (must(await sb.from('transactions').select('*').eq('user_id', me).order('created_at', { ascending: false })) as any[]).map(toTx); },
    async exportMine() {
      const [me, ads, favs, sv, tx, th] = await Promise.all([this.me(), this.myAds(), this.favoriteIds(), this.saved(), this.myTx(), this.threads()]);
      return { profile: me, ads, favorites: favs, savedSearches: sv, transactions: tx, threads: th };
    },
    async queue() { return (must(await sb.from('ads').select(SEL).eq('status', 'pending').order('created_at')) as any[]).map(toAd); },
    async moderate(id, approve, reason) { must(await sb.rpc('moderate_ad', { p_ad: id, p_approve: approve, p_reason: reason ?? null })); },
    async reports() { return (must(await sb.from('reports').select('*, ads(title)').order('created_at', { ascending: false })) as any[]).map((r) => ({ id: r.id, adId: r.ad_id, adTitle: r.ads?.title ?? '', reason: r.reason, details: r.details, status: r.status, createdAt: r.created_at })); },
    async resolveReport(id, status) { must(await sb.from('reports').update({ status }).eq('id', id)); },
    async users() { return (must(await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(200)) as any[]).map((p) => ({ id: p.id, name: p.display_name, email: '', role: p.role, banned: p.banned, city: p.city, createdAt: p.created_at })); },
    async setBan(id, banned) { must(await sb.rpc('set_ban', { p_user: id, p_banned: banned })); },
    async allTx() { return (must(await sb.from('transactions').select('*, profiles(display_name)').order('created_at', { ascending: false }).limit(200)) as any[]).map((t) => ({ ...toTx(t), userName: t.profiles?.display_name })); },
    async setPrice(code, amount) { must(await sb.from('prices').update({ amount }).eq('code', code)); },
    async audit() { return (must(await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100)) as any[]).map((a) => ({ id: String(a.id), action: a.action, target: a.target, note: a.note, createdAt: a.created_at })); },
    async botEnabled() { return (must(await sb.from('bot_settings').select('enabled').single()) as any).enabled; },
    async setBotEnabled(on) { must(await sb.from('bot_settings').update({ enabled: on }).eq('id', true)); },
    async botRules() { return (must(await sb.from('bot_rules').select('*').order('id')) as any[]).map((r) => ({ id: String(r.id), pattern: r.pattern, reason: r.reason })); },
    async addBotRule(pattern, reason) { must(await sb.from('bot_rules').insert({ pattern, reason })); },
    async deleteBotRule(id) { must(await sb.from('bot_rules').delete().eq('id', id)); },
    async adminAds() { return (must(await sb.from('ads').select(SEL).order('created_at', { ascending: false }).limit(500)) as any[]).map(toAd); },
  };
}
const toTx = (t: any): Tx => ({ id: t.id, adId: t.ad_id, code: t.code, listPrice: Number(t.list_price), charged: Number(t.charged), createdAt: t.created_at });

// ---------------------------------------------------------------- Demo (localStorage)
const KEY = 'pirk-demo-v1';
interface DB { ads: Ad[]; users: User[]; fav: string[]; saved: SavedSearch[]; threads: (Thread & { })[]; msgs: Message[]; reports: Report[]; prices: Price[]; changes: PriceChange[]; tx: Tx[]; audit: AuditEntry[]; session: string | null }
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const ahead = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
const ME = 'u-demo';

function seed(): DB {
  const T: [string, string, string, number | null, Record<string, string>, string][] = [
    ['transport','cars','BMW 320d Touring, 2017',11900,{brand:'BMW',year:'2017',mileage:'168000',fuel:'Dīzelis',gearbox:'Automāts'},'Regulāri apkalpots, servisa grāmatiņa, jaunas riepas.'],
    ['transport','cars','BMW 520d, 2015',12500,{brand:'BMW',year:'2015',mileage:'210000',fuel:'Dīzelis',gearbox:'Automāts'},'Labā tehniskā stāvoklī, TA līdz nākamā gada vasarai.'],
    ['transport','cars','BMW X3 xDrive20d, 2016',15900,{brand:'BMW',year:'2016',mileage:'185000',fuel:'Dīzelis',gearbox:'Automāts'},'Pilnpiedziņa, panorāmas jumts.'],
    ['transport','cars','BMW 118i, 2018',13400,{brand:'BMW',year:'2018',mileage:'92000',fuel:'Benzīns',gearbox:'Manuāla'},'Ekonomisks pilsētas auto.'],
    ['transport','cars','BMW 330e hibrīds, 2019',22900,{brand:'BMW',year:'2019',mileage:'88000',fuel:'Hibrīds',gearbox:'Automāts'},'Uzlādējams hibrīds, viens īpašnieks Latvijā.'],
    ['transport','cars','Volkswagen Golf 1.6 TDI, 2014',6900,{brand:'Volkswagen',year:'2014',mileage:'198000',fuel:'Dīzelis',gearbox:'Manuāla'},'Ekonomisks, nerūsējošs.'],
    ['transport','cars','Toyota RAV4 hibrīds, 2020',27500,{brand:'Toyota',year:'2020',mileage:'74000',fuel:'Hibrīds',gearbox:'Automāts'},'Pirkts salonā Latvijā.'],
    ['transport','cars','Tesla Model 3 Long Range, 2021',26900,{brand:'Tesla',year:'2021',mileage:'61000',fuel:'Elektro',gearbox:'Automāts'},'Akumulators 92%, autopilots.'],
    ['transport','moto','Yamaha MT-07, 2019',6200,{brand:'Yamaha',year:'2019',mileage:'14000',fuel:'Benzīns',gearbox:'Manuāla'},'Garāžā glabāts.'],
    ['transport','parts','Ziemas riepas 225/45 R17, komplekts',180,{brand:'Michelin'},'Protektors 6 mm, 2 sezonas.'],
    ['realty','flats','2 istabu dzīvoklis Centrā, renovēts',139000,{rooms:'2',area:'58',floor:'3'},'Klusā pagalma pusē, jauna virtuve, autonomā apkure.'],
    ['realty','flats','3 istabu dzīvoklis Purvciemā',82000,{rooms:'3',area:'67',floor:'5'},'Ērta plānojuma dzīvoklis, tuvu skolai un veikaliem.'],
    ['realty','flats','1 istabas dzīvoklis Imantā',54500,{rooms:'1',area:'33',floor:'2'},'Lieliski piemērots izīrēšanai.'],
    ['realty','flats','Jaunais projekts Mežaparkā, 2 istabas',189000,{rooms:'2',area:'62',floor:'4'},'Terase, pazemes autostāvvieta.'],
    ['realty','flats','2 istabas Āgenskalnā',97000,{rooms:'2',area:'49',floor:'1'},'Vēsturiska ēka, augsti griesti.'],
    ['realty','houses','Privātmāja ar dārzu, 142 m²',245000,{rooms:'5',area:'142'},'Klusa apkaime, 1200 m² zemes gabals.'],
    ['realty','rent','Izīrē studiju Vecrīgā',620,{rooms:'1',area:'30',floor:'2'},'Mēbelēts, ilgtermiņā.'],
    ['realty','land','Zemes gabals pie Gaujas, 0.8 ha',36000,{area:'8000'},'Elektrība pie robežas.'],
    ['electronics','phones','iPhone 15 Pro 256 GB',749,{brand:'Apple',condition:'Kā jauns'},'Pilns komplekts, akumulators 96%.'],
    ['electronics','phones','iPhone 14 128 GB',479,{brand:'Apple',condition:'Lietots'},'Daži sīki skrāpējumi uz rāmja.'],
    ['electronics','phones','iPhone 13 128 GB',359,{brand:'Apple',condition:'Lietots'},'Strādā nevainojami.'],
    ['electronics','phones','iPhone 15 128 GB',599,{brand:'Apple',condition:'Kā jauns'},'Ar garantiju.'],
    ['electronics','phones','iPhone 12 mini 64 GB',229,{brand:'Apple',condition:'Lietots'},'Kompakts un ātrs.'],
    ['electronics','phones','Samsung Galaxy S24',620,{brand:'Samsung',condition:'Kā jauns'},'Čeks un garantija.'],
    ['electronics','computers','MacBook Air M2, 16 GB',890,{brand:'Apple',condition:'Kā jauns'},'Tikai 40 uzlādes cikli.'],
    ['electronics','computers','Spēļu dators RTX 4070, Ryzen 7',1150,{brand:'Custom',condition:'Lietots'},'Klusa ūdens dzesēšana.'],
    ['electronics','gaming','PlayStation 5 + 2 pulti',390,{brand:'Sony',condition:'Lietots'},'Ar trim spēlēm.'],
    ['electronics','audio','Sony WH-1000XM5 austiņas',210,{brand:'Sony',condition:'Kā jauns'},'Trokšņu slāpēšana, pilns komplekts.'],
    ['jobs','vacancies','Noliktavas darbinieks, Rīga',null,{},'Pilna slodze, alga no 1400 € bruto. Oficiāli.'],
    ['jobs','vacancies','Frontend izstrādātājs (hibrīds)',null,{},'React, TypeScript. Komandā 8 cilvēki.'],
    ['jobs','services','Santehniķis, ātri un kvalitatīvi',35,{},'Izbraucu visā Pierīgā. Cena par stundu.'],
    ['jobs','services','Dzīvokļu remonts pēc atslēgas',null,{},'Tāme bez maksas, garantija darbiem.'],
    ['home','furniture','Dīvāns stūra, pelēks',320,{condition:'Lietots'},'Izvelkams, ar kasti veļai.'],
    ['home','furniture','Ozolkoka galds, 180 cm',450,{condition:'Kā jauns'},'Vietējā meistara darbs.'],
    ['home','appliances','Bosch veļas mašīna 8 kg',240,{condition:'Lietots'},'Darbojas perfekti.'],
    ['home','garden','Zāles pļāvējs Husqvarna',160,{condition:'Lietots'},'Sezona jau pie durvīm.'],
    ['fashion','men','Vīriešu ziemas jaka, L',65,{condition:'Kā jauns'},'Vilkta vienu sezonu.'],
    ['fashion','women','Ādas zābaki, 38. izmērs',45,{condition:'Lietots'},'Labā stāvoklī.'],
    ['kids','strollers','Bērnu ratiņi Cybex 2 in 1',280,{condition:'Lietots'},'Viens bērns, tīri.'],
    ['kids','toys','LEGO City kolekcija, 6 kg',85,{condition:'Lietots'},'Visi klucīši tīri, sašķiroti.'],
    ['animals','dogs','Labradora kucēni, ar dokumentiem',650,{},'Vakcinēti, gatavi jaunajām mājām.'],
    ['animals','cats','Atdod labās rokās kaķēnus',0,{},'Mīļi, pieraduši pie kastes.'],
    ['hobby','bikes','Kalnu velosipēds Trek Marlin 7',540,{condition:'Lietots'},'Hidrauliskās bremzes, 29 collu riteņi.'],
    ['hobby','bikes','Elektrovelosipēds Cube, 2022',1490,{condition:'Lietots'},'Bosch motors, nobraukti 3000 km.'],
    ['hobby','music','Akustiskā ģitāra Yamaha F310',95,{condition:'Lietots'},'Ar somu.'],
    ['hobby','sport','Slēpošanas komplekts, 170 cm',130,{condition:'Lietots'},'Slēpes, zābaki, nūjas.'],
  ];
  const names = ['Mārtiņš K.','Anna V.','Dmitrijs S.','Ilze B.','Jānis O.','Olga P.','AutoCentrs SIA','Kristaps L.'];
  const users: User[] = names.map((n, i) => ({ id: 'u' + i, name: n, email: `demo${i}@example.lv`, role: 'user', createdAt: ago(10 + i * 9) }));
  users.push({ id: ME, name: 'Demo lietotājs', email: 'demo@example.lv', role: 'admin', city: 'Rīga', phone: '+371 20 000 000', createdAt: ago(120) });
  const ads: Ad[] = T.map((t, i): Ad => {
    const inRiga = i % 3 === 0 || ['flats', 'rent', 'vacancies'].includes(t[1]); const c = inRiga ? CITIES[0] : t[2].includes('Gaujas') ? CITIES[9] : CITIES[i % CITIES.length]; const age = (i * 3.7) % 28 + 0.3; const own = users[i % names.length];
    return { id: 'ad' + i, ownerId: own.id, ownerName: own.name, category: t[0], subcategory: t[1], title: t[2], price: t[3], attrs: t[4], description: t[5],
      city: c.name, lat: c.lat + ((i * 37) % 40 - 20) / 900, lng: c.lng + ((i * 53) % 40 - 20) / 500, photos: [], showPhone: true, status: 'active', views: 40 + (i * 83) % 900,
      topUntil: i % 13 === 2 ? ahead(4) : null, highlightUntil: i % 11 === 4 ? ahead(3) : null, bumpedAt: ago(age), createdAt: ago(age + 1), expiresAt: ahead(60 - age),
      priceHistory: i % 6 === 0 && t[3] ? [{ at: ago(age / 2), price: Math.round(t[3] * 1.08) }] : [] };
  });
  const mine = (i: number, patch: Partial<Ad>) => { Object.assign(ads[i], { ownerId: ME, ownerName: 'Demo lietotājs' }, patch); };
  mine(0, {}); mine(32, { status: 'paused' }); mine(44, { status: 'pending' }); mine(26, { status: 'rejected', rejectReason: 'Neatbilstoša kategorija' });
  ads[35].status = 'pending'; ads[37].status = 'pending';
  return {
    ads, users, fav: ['ad10', 'ad24'], saved: [{ id: 's1', label: 'iPhone līdz 500 €', query: 'category=electronics&subcategory=phones&max=500', createdAt: ago(3) }],
    threads: [{ id: 't1', adId: 'ad0', adTitle: ads[0].title, otherName: 'Anna V.', updatedAt: ago(0.1) }],
    msgs: [{ id: 'm1', threadId: 't1', senderId: 'u1', body: 'Sveiki! Vai auto vēl ir pieejams?', createdAt: ago(0.2) }, { id: 'm2', threadId: 't1', senderId: ME, body: 'Labdien! Jā, var apskatīt nedēļas nogalē.', createdAt: ago(0.15) }, { id: 'm3', threadId: 't1', senderId: 'u1', body: 'Lieliski, sestdien 11:00 būtu labi?', createdAt: ago(0.1) }],
    reports: [{ id: 'r1', adId: 'ad5', adTitle: ads[5].title, reason: 'scam', details: 'Cena šķiet aizdomīgi zema.', status: 'open', createdAt: ago(1) }],
    prices: [{ code: 'top', amount: 2.99, days: 7 }, { code: 'highlight', amount: 0.99, days: 7 }, { code: 'bump', amount: 0.49, days: 0 }],
    changes: [], tx: [], audit: [{ id: 'a1', action: 'approve', target: 'ad3', createdAt: ago(1) }], session: ME,
  };
}
function demoApi(): Api {
  let db: DB;
  try { db = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? seed(); } catch { db = seed(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { throw new Error('quota'); } };
  const log = (action: string, target?: string, note?: string) => db.audit.unshift({ id: 'a' + Date.now(), action, target, note, createdAt: new Date().toISOString() });
  const ok = async <T,>(v: T): Promise<T> => v;
  const live = (a: Ad) => a.status === 'active' && new Date(a.expiresAt) > new Date();
  const adOf = (id: string) => db.ads.find((a) => a.id === id);
  const api: Api = {
    demo: true,
    me: () => ok(db.users.find((u) => u.id === db.session) ?? null),
    async signIn() { db.session = ME; save(); return 'in'; },
    async signOut() { db.session = null; save(); },
    async updateMe(p) { Object.assign(db.users.find((u) => u.id === ME)!, { name: p.name, city: p.city, phone: p.phone }); save(); },
    async search(f) {
      const words = strip(f.q ?? '').split(/\s+/).filter(Boolean);
      let r = db.ads.filter(live).filter((a) => {
        const hay = strip(`${a.title} ${a.description} ${a.city} ${Object.values(a.attrs).join(' ')}`);
        if (!words.every((w) => hay.includes(w))) return false;
        if (f.category && a.category !== f.category) return false;
        if (f.subcategory && a.subcategory !== f.subcategory) return false;
        if (f.city && a.city !== f.city) return false;
        if (f.min != null && (a.price == null || a.price < f.min)) return false;
        if (f.max != null && (a.price == null || a.price > f.max)) return false;
        if (f.withPhoto && !a.photos.length) return false;
        return Object.entries(f.attrs ?? {}).every(([k, v]) => {
          const val = a.attrs[k];
          if (v.eq != null && val?.toLowerCase() !== v.eq.toLowerCase()) return false;
          if (v.min != null && !(Number(val) >= v.min)) return false;
          if (v.max != null && !(Number(val) <= v.max)) return false;
          return true;
        });
      });
      const s = f.sort ?? 'new'; const byDate = (a: Ad, b: Ad) => b.bumpedAt.localeCompare(a.bumpedAt);
      r = [...r].sort(s === 'new' ? (a, b) => Number(isTop(b)) - Number(isTop(a)) || byDate(a, b)
        : s === 'cheap' ? (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) : (a, b) => (b.price ?? -1) - (a.price ?? -1));
      const off = f.offset ?? 0;
      return { total: r.length, items: r.slice(off, off + (f.limit ?? 24)) };
    },
    ad: (id) => ok(adOf(id) ?? null),
    async addView(id) { const a = adOf(id); if (a) { a.views++; save(); } },
    revealPhone: () => ok('+371 20 000 000'),
    myAds: () => ok(db.ads.filter((a) => a.ownerId === ME).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    async saveAd(d, id) {
      const city = CITIES.find((c) => c.name === d.city); const now = new Date().toISOString();
      if (id) {
        const a = adOf(id)!; if (a.price !== d.price) a.priceHistory.push({ at: now, price: a.price });
        const reMod = a.title !== d.title || a.description !== d.description || a.photos.join() !== d.photos.join();
        Object.assign(a, d, reMod ? { status: 'pending' } : {}); save(); return id;
      }
      const nid = 'ad' + Date.now();
      db.ads.unshift({ ...d, id: nid, ownerId: ME, ownerName: db.users.find((u) => u.id === ME)!.name, lat: city?.lat ?? null, lng: city?.lng ?? null, status: 'pending', views: 0, bumpedAt: now, createdAt: now, expiresAt: ahead(60), priceHistory: [] });
      save(); return nid;
    },
    async setStatus(id, s) { adOf(id)!.status = s; save(); },
    async deleteAd(id) { db.ads = db.ads.filter((a) => a.id !== id); save(); },
    async upload(file) {
      const blob = await compressImage(file, 800, 0.6);
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
    },
    favorites: () => ok(db.fav.map(adOf).filter(Boolean) as Ad[]),
    favoriteIds: () => ok(db.fav),
    async toggleFavorite(id, on) { db.fav = on ? [id, ...db.fav] : db.fav.filter((x) => x !== id); save(); },
    saved: () => ok(db.saved),
    async addSaved(label, query) { db.saved.unshift({ id: 's' + Date.now(), label, query, createdAt: new Date().toISOString() }); save(); },
    async deleteSaved(id) { db.saved = db.saved.filter((s) => s.id !== id); save(); },
    threads: () => ok([...db.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    messages: (t) => ok(db.msgs.filter((m) => m.threadId === t)),
    async openThread(ad) {
      const ex = db.threads.find((t) => t.adId === ad.id); if (ex) return ex.id;
      const id = 't' + Date.now(); db.threads.unshift({ id, adId: ad.id, adTitle: ad.title, otherName: ad.ownerName, updatedAt: new Date().toISOString() }); save(); return id;
    },
    async send(threadId, body) { const now = new Date().toISOString(); db.msgs.push({ id: 'm' + Date.now(), threadId, senderId: ME, body, createdAt: now }); db.threads.find((t) => t.id === threadId)!.updatedAt = now; save(); },
    async report(adId, reason, details) { db.reports.unshift({ id: 'r' + Date.now(), adId, adTitle: adOf(adId)?.title ?? '', reason, details, status: 'open', createdAt: new Date().toISOString() }); save(); },
    prices: () => ok(db.prices),
    priceChanges: () => ok(db.changes),
    async boost(id, code) {
      const a = adOf(id)!, p = db.prices.find((x) => x.code === code)!;
      if (code === 'top') a.topUntil = ahead(p.days); if (code === 'highlight') a.highlightUntil = ahead(p.days);
      if (code === 'bump') a.bumpedAt = new Date().toISOString();
      db.tx.unshift({ id: 'tx' + Date.now(), adId: id, code, listPrice: p.amount, charged: 0, createdAt: new Date().toISOString(), userName: 'Demo lietotājs' }); save();
    },
    myTx: () => ok(db.tx),
    async exportMine() { return { profile: await api.me(), ads: await api.myAds(), favorites: db.fav, savedSearches: db.saved, transactions: db.tx, threads: db.threads }; },
    queue: () => ok(db.ads.filter((a) => a.status === 'pending')),
    async moderate(id, approve, reason) { const a = adOf(id)!; a.status = approve ? 'active' : 'rejected'; a.rejectReason = approve ? null : reason; if (approve) a.bumpedAt = new Date().toISOString(); log(approve ? 'approve' : 'reject', a.title, reason); save(); },
    reports: () => ok(db.reports),
    async resolveReport(id, status) { db.reports.find((r) => r.id === id)!.status = status; log('report_' + status, id); save(); },
    users: () => ok(db.users),
    async setBan(id, banned) { db.users.find((u) => u.id === id)!.banned = banned; if (banned) db.ads.forEach((a) => { if (a.ownerId === id && a.status === 'active') a.status = 'paused'; }); log(banned ? 'ban' : 'unban', id); save(); },
    allTx: () => ok(db.tx),
    async setPrice(code, amount) { const p = db.prices.find((x) => x.code === code)!; db.changes.unshift({ code, oldAmount: p.amount, newAmount: amount, createdAt: new Date().toISOString() }); log('price_change', code, `${p.amount} -> ${amount}`); p.amount = amount; save(); },
    audit: () => ok(db.audit),
    adminAds: () => ok(db.ads),
    botEnabled: () => ok(false),
    async setBotEnabled() { /* the bot runs in the database; demo mode has none */ },
    botRules: () => ok([]),
    async addBotRule() { /* see above */ },
    async deleteBotRule() { /* see above */ },
  };
  return api;
}

export const api: Api = SB_URL && SB_KEY ? supabaseApi() : demoApi();
export const categoryCount = CATEGORIES.length;
