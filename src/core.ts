// Brand, shared types, category tree, cities and the natural-language search parser.
export const BRAND = { name: 'Pērc vai pārdod', domain: 'percvaipardod.lv', email: 'livonianlabs@gmail.com' };
// Beta: promotion is free and clearly marked. Flip when payments launch on own hosting.
export const BETA = true;

export type Lang = 'lv' | 'ru';
export type L = { lv: string; ru: string };
export type Status = 'pending' | 'active' | 'paused' | 'rejected' | 'expired' | 'sold';

export interface Ad {
  id: string; ownerId: string; ownerName: string; title: string; description: string;
  price: number | null; category: string; subcategory: string; city: string;
  lat: number | null; lng: number | null; attrs: Record<string, string>; photos: string[];
  showPhone: boolean; status: Status; rejectReason?: string | null; views: number;
  topUntil?: string | null; highlightUntil?: string | null; bumpedAt: string; createdAt: string;
  expiresAt: string; priceHistory: { at: string; price: number | null }[]; botNote?: string | null; modSource?: 'bot' | 'human' | 'reports' | null;
}
export interface BotRule { id: string; pattern: string; reason: string }
export type AdDraft = Pick<Ad, 'title' | 'description' | 'price' | 'category' | 'subcategory' | 'city' | 'attrs' | 'photos' | 'showPhone'>;
export interface Filter {
  q?: string; category?: string; subcategory?: string; city?: string; min?: number; max?: number;
  attrs?: Record<string, { eq?: string; min?: number; max?: number }>;
  withPhoto?: boolean; sort?: 'new' | 'cheap' | 'expensive'; limit?: number; offset?: number;
}
export interface User { id: string; name: string; email: string; city?: string | null; phone?: string | null; role: 'user' | 'admin'; banned?: boolean; createdAt?: string }
export interface Thread { id: string; adId: string; adTitle: string; adPhoto?: string; otherName: string; updatedAt: string }
export interface Message { id: string; threadId: string; senderId: string; body: string; createdAt: string }
export interface Report { id: string; adId: string; adTitle: string; reason: string; details?: string; status: 'open' | 'resolved' | 'dismissed'; createdAt: string }
export interface Price { code: 'top' | 'highlight' | 'bump'; amount: number; days: number }
export interface PriceChange { code: string; oldAmount: number | null; newAmount: number; createdAt: string }
export interface Tx { id: string; adId?: string | null; code: string; listPrice: number; charged: number; createdAt: string; userName?: string }
export interface SavedSearch { id: string; label: string; query: string; createdAt: string }
export interface AuditEntry { id: string; action: string; target?: string; note?: string; createdAt: string }

export type Field = { key: string; label: L; type: 'number' | 'select' | 'text'; options?: string[]; suffix?: string; filter?: boolean };
export type Sub = { id: string; name: L };
export type Category = { id: string; name: L; icon: string; hue: number; subs: Sub[]; fields: Field[] };

const condition: Field = { key: 'condition', label: { lv: 'Stāvoklis', ru: 'Состояние' }, type: 'select', options: ['Jauns', 'Kā jauns', 'Lietots', 'Remontam'], filter: true };

export const CATEGORIES: Category[] = [
  { id: 'transport', name: { lv: 'Transports', ru: 'Транспорт' }, icon: '🚗', hue: 215,
    subs: [
      { id: 'cars', name: { lv: 'Vieglie auto', ru: 'Легковые авто' } }, { id: 'moto', name: { lv: 'Moto', ru: 'Мото' } },
      { id: 'trucks', name: { lv: 'Kravas auto', ru: 'Грузовые' } }, { id: 'parts', name: { lv: 'Rezerves daļas', ru: 'Запчасти' } },
    ],
    fields: [
      { key: 'brand', label: { lv: 'Marka', ru: 'Марка' }, type: 'text', filter: true },
      { key: 'year', label: { lv: 'Gads', ru: 'Год' }, type: 'number', filter: true },
      { key: 'mileage', label: { lv: 'Nobraukums', ru: 'Пробег' }, type: 'number', suffix: 'km', filter: true },
      { key: 'fuel', label: { lv: 'Degviela', ru: 'Топливо' }, type: 'select', options: ['Benzīns', 'Dīzelis', 'Hibrīds', 'Elektro', 'Gāze'], filter: true },
      { key: 'gearbox', label: { lv: 'Ātrumkārba', ru: 'Коробка' }, type: 'select', options: ['Manuāla', 'Automāts'], filter: true },
    ] },
  { id: 'realty', name: { lv: 'Nekustamais īpašums', ru: 'Недвижимость' }, icon: '🏠', hue: 160,
    subs: [
      { id: 'flats', name: { lv: 'Dzīvokļi', ru: 'Квартиры' } }, { id: 'houses', name: { lv: 'Mājas', ru: 'Дома' } },
      { id: 'land', name: { lv: 'Zeme', ru: 'Земля' } }, { id: 'rent', name: { lv: 'Īre', ru: 'Аренда' } },
    ],
    fields: [
      { key: 'rooms', label: { lv: 'Istabas', ru: 'Комнаты' }, type: 'number', filter: true },
      { key: 'area', label: { lv: 'Platība', ru: 'Площадь' }, type: 'number', suffix: 'm²', filter: true },
      { key: 'floor', label: { lv: 'Stāvs', ru: 'Этаж' }, type: 'number' },
    ] },
  { id: 'electronics', name: { lv: 'Elektronika', ru: 'Электроника' }, icon: '📱', hue: 265,
    subs: [
      { id: 'phones', name: { lv: 'Telefoni', ru: 'Телефоны' } }, { id: 'computers', name: { lv: 'Datori', ru: 'Компьютеры' } },
      { id: 'audio', name: { lv: 'Audio un TV', ru: 'Аудио и ТВ' } }, { id: 'gaming', name: { lv: 'Spēles', ru: 'Игры' } },
    ],
    fields: [{ key: 'brand', label: { lv: 'Ražotājs', ru: 'Производитель' }, type: 'text', filter: true }, condition] },
  { id: 'jobs', name: { lv: 'Darbs un pakalpojumi', ru: 'Работа и услуги' }, icon: '💼', hue: 35,
    subs: [
      { id: 'vacancies', name: { lv: 'Vakances', ru: 'Вакансии' } }, { id: 'cv', name: { lv: 'Meklē darbu', ru: 'Ищу работу' } },
      { id: 'services', name: { lv: 'Pakalpojumi', ru: 'Услуги' } },
    ], fields: [] },
  { id: 'home', name: { lv: 'Māja un dārzs', ru: 'Дом и сад' }, icon: '🛋️', hue: 95,
    subs: [
      { id: 'furniture', name: { lv: 'Mēbeles', ru: 'Мебель' } }, { id: 'appliances', name: { lv: 'Sadzīves tehnika', ru: 'Бытовая техника' } },
      { id: 'garden', name: { lv: 'Dārzs', ru: 'Сад' } }, { id: 'building', name: { lv: 'Būvniecība', ru: 'Стройка' } },
    ], fields: [condition] },
  { id: 'fashion', name: { lv: 'Apģērbs un apavi', ru: 'Одежда и обувь' }, icon: '👟', hue: 335,
    subs: [
      { id: 'women', name: { lv: 'Sievietēm', ru: 'Женщинам' } }, { id: 'men', name: { lv: 'Vīriešiem', ru: 'Мужчинам' } },
      { id: 'kids', name: { lv: 'Bērniem', ru: 'Детям' } },
    ], fields: [condition] },
  { id: 'kids', name: { lv: 'Bērnu preces', ru: 'Детские товары' }, icon: '🧸', hue: 15,
    subs: [{ id: 'strollers', name: { lv: 'Ratiņi', ru: 'Коляски' } }, { id: 'toys', name: { lv: 'Rotaļlietas', ru: 'Игрушки' } }], fields: [condition] },
  { id: 'animals', name: { lv: 'Dzīvnieki', ru: 'Животные' }, icon: '🐾', hue: 55,
    subs: [{ id: 'dogs', name: { lv: 'Suņi', ru: 'Собаки' } }, { id: 'cats', name: { lv: 'Kaķi', ru: 'Кошки' } }, { id: 'farm', name: { lv: 'Lauksaimniecība', ru: 'Хозяйство' } }], fields: [] },
  { id: 'hobby', name: { lv: 'Hobiji un sports', ru: 'Хобби и спорт' }, icon: '🚴', hue: 190,
    subs: [{ id: 'bikes', name: { lv: 'Velosipēdi', ru: 'Велосипеды' } }, { id: 'sport', name: { lv: 'Sports', ru: 'Спорт' } }, { id: 'music', name: { lv: 'Mūzika', ru: 'Музыка' } }], fields: [condition] },
];
export const catById = (id?: string) => CATEGORIES.find((c) => c.id === id);
export const subById = (c?: string, s?: string) => catById(c)?.subs.find((x) => x.id === s);

export const CITIES: { name: string; lat: number; lng: number; alias: string[] }[] = [
  { name: 'Rīga', lat: 56.9496, lng: 24.1052, alias: ['rig', 'риг', 'рига'] },
  { name: 'Jūrmala', lat: 56.968, lng: 23.77, alias: ['jurmal', 'юрмал'] },
  { name: 'Daugavpils', lat: 55.8747, lng: 26.5362, alias: ['daugavpil', 'даугавпил', 'двинск'] },
  { name: 'Liepāja', lat: 56.5047, lng: 21.0108, alias: ['liepaj', 'лиепа'] },
  { name: 'Jelgava', lat: 56.65, lng: 23.7128, alias: ['jelgav', 'елгав'] },
  { name: 'Ventspils', lat: 57.3942, lng: 21.5647, alias: ['ventspil', 'вентспил'] },
  { name: 'Rēzekne', lat: 56.5099, lng: 27.3331, alias: ['rezekn', 'резекн'] },
  { name: 'Valmiera', lat: 57.5411, lng: 25.4275, alias: ['valmier', 'валмиер'] },
  { name: 'Ogre', lat: 56.8167, lng: 24.6, alias: ['ogre', 'огре'] },
  { name: 'Cēsis', lat: 57.3119, lng: 25.2747, alias: ['cesi', 'цесис'] },
];

export const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CATEGORY_WORDS: [RegExp, string, string?][] = [
  [/^(auto|masin|машин|авто)/, 'transport', 'cars'], [/^(dzivokl|квартир)/, 'realty', 'flats'],
  [/^(maja|maju|дом$|дома$)/, 'realty', 'houses'], [/^(ire|аренд)/, 'realty', 'rent'],
  [/^(telefon|телефон)/, 'electronics', 'phones'], [/^(dator|portativ|ноутбук|компьютер)/, 'electronics', 'computers'],
  [/^(darbs|vakanc|работ|ваканс)/, 'jobs', 'vacancies'], [/^(velo|велосипед)/, 'hobby', 'bikes'],
  [/^(meble|мебел)/, 'home', 'furniture'], [/^(sun[si]|собак)/, 'animals', 'dogs'], [/^(kak[is]|кошк|кот)/, 'animals', 'cats'],
];

export interface Parsed { q: string; min?: number; max?: number; city?: string; category?: string; subcategory?: string }
/** "bmw līdz 5000 rīgā" / "квартира в риге до 90000" → structured filter. Deterministic, runs locally. */
export function parseQuery(input: string): Parsed {
  const out: Parsed = { q: '' };
  let s = ' ' + strip(input).replace(/(\d)[ .](?=\d{3}\b)/g, '$1') + ' ';
  const num = (m: string) => { const k = /(\d+(?:[.,]\d+)?)\s*(k|т|тыс)\b/.exec(m); return k ? parseFloat(k[1].replace(',', '.')) * 1000 : parseInt(m.replace(/\D/g, ''), 10); };
  s = s.replace(/\s(lidz|до|max)\s+(\d[\d.,]*\s*(?:k|т|тыс)?)(?:\s*(?:eur|euro|евро|€))?(?=\s)/, (_, __, v) => { out.max = num(v); return ' '; });
  s = s.replace(/\s(no|от|min)\s+(\d[\d.,]*\s*(?:k|т|тыс)?)(?:\s*(?:eur|euro|евро|€))?(?=\s)/, (_, __, v) => { out.min = num(v); return ' '; });
  const words = s.trim().split(/\s+/).filter(Boolean);
  const rest: string[] = [];
  for (const w of words) {
    if (w === 'в' || w === 'во') continue;
    const city = !out.city && CITIES.find((c) => c.alias.some((a) => w.startsWith(a)));
    if (city) { out.city = city.name; continue; }
    const cat = !out.category && CATEGORY_WORDS.find(([re]) => re.test(w));
    if (cat) { out.category = cat[1]; out.subcategory = cat[2]; continue; }
    rest.push(w);
  }
  out.q = rest.join(' ');
  return out;
}

/** Median of comparable ads. Returns null below 4 comparables rather than show a guess. */
export function priceInsight(ad: Ad, peers: Ad[]): { pct: number; median: number; n: number } | null {
  if (ad.price == null || ad.price <= 0) return null;
  const brand = ad.attrs.brand?.toLowerCase();
  const same = peers.filter((p) => p.id !== ad.id && p.price && p.subcategory === ad.subcategory && (!brand || p.attrs.brand?.toLowerCase() === brand));
  if (same.length < 4) return null;
  const v = same.map((p) => p.price as number).sort((a, b) => a - b);
  const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return { pct: Math.round(((ad.price - m) / m) * 100), median: m, n: same.length };
}

export const money = (n: number | null, free: string) => n == null ? free : new Intl.NumberFormat('lv-LV', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
export const isTop = (a: Ad) => !!a.topUntil && new Date(a.topUntil) > new Date();
export const isHi = (a: Ad) => !!a.highlightUntil && new Date(a.highlightUntil) > new Date();

export function art(category: string, seed: string): string {
  const c = catById(category);
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = (c?.hue ?? 200) + (h % 30) - 15;
  const x = 20 + (h % 60), y = 20 + ((h >> 4) % 60);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><defs><radialGradient id='g' cx='${x}%' cy='${y}%' r='90%'><stop offset='0' stop-color='hsl(${hue},75%,72%)'/><stop offset='1' stop-color='hsl(${hue + 35},55%,32%)'/></radialGradient></defs><rect width='400' height='300' fill='url(#g)'/><text x='200' y='180' font-size='96' text-anchor='middle' opacity='.9'>${c?.icon ?? '📦'}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
export const cover = (a: Pick<Ad, 'photos' | 'category' | 'id'>) => a.photos[0] ?? art(a.category, a.id);

/** Client-side resize to WebP: fast uploads on mobile and low storage costs. */
export async function compressImage(file: File, maxSide: number, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('compress'))), 'image/webp', quality));
}
