// Runs schema.sql in an in-process Postgres (PGlite) with Supabase's auth/storage
// stubbed, and attacks the security rules as real non-superuser roles.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
`);
await db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const [A, B, ADMIN, OUT] = ['a', 'b', 'c', 'd'].map((c) => `${c.repeat(8)}-0000-4000-8000-000000000000`);
await db.exec(`insert into auth.users values ('${A}','alice@x.lv'),('${B}','bob@x.lv'),('${ADMIN}','root@x.lv');
  update profiles set role='admin' where id='${ADMIN}';
  insert into profile_contacts values ('${A}','+37120000000');`);

let failed = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failed++; };

async function as(uid, fn) {
  await db.exec(`set test.uid = '${uid ?? ''}'; set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await fn(); } finally { await db.exec(`reset role; set test.uid = '';`); }
}
const denied = async (uid, sql, params) => {
  try { await as(uid, () => db.query(sql, params)); return false; } catch { return true; }
};
const q = async (uid, sql, params) => (await as(uid, () => db.query(sql, params))).rows;

// A inserts and tries to self-approve/self-boost.
const [ad] = await q(A, `insert into ads (owner_id,title,category,subcategory,city,price,status,views,top_until)
  values ($1,'BMW 320d','transport','cars','Rīga',5000,'active',999,'2099-01-01') returning *`, [A]);
ok('insert forces pending/zero views/no boost', ad.status === 'pending' && ad.views === 0 && ad.top_until === null);
ok('cannot insert as another user', await denied(B, `insert into ads (owner_id,title,category,subcategory,city) values ($1,'xxx','a','b','c')`, [A]));
ok('pending hidden from anon', (await q(null, 'select * from ads')).length === 0);
ok('pending hidden from other user', (await q(B, 'select * from ads')).length === 0);
ok('owner sees own pending', (await q(A, 'select * from ads')).length === 1);
ok('owner cannot self-approve', await denied(A, `update ads set status='active' where id=$1`, [ad.id]));
ok('non-admin cannot moderate', await denied(A, `select moderate_ad($1,true)`, [ad.id]));
ok('other user cannot edit (no rows)', (await q(B, `update ads set title='hack' where id=$1 returning id`, [ad.id])).length === 0);

await q(ADMIN, `select moderate_ad($1,true)`, [ad.id]);
ok('approved ad visible to anon', (await q(null, 'select * from ads')).length === 1);

const s1 = (await q(null, `select search_ads(p_q => 'bmw riga', p_max => 6000) r`))[0].r;
ok('search: diacritics-insensitive + price', s1.total === 1 && s1.items[0].owner_name === 'alice');
ok('search hides internal search_text', !('search_text' in s1.items[0]));
ok('search: price filter excludes', (await q(null, `select search_ads(p_max => 100) r`))[0].r.total === 0);

await q(A, `update ads set price=4500, views=1000, top_until='2099-01-01' where id=$1`, [ad.id]);
const [after] = await q(A, 'select * from ads where id=$1', [ad.id]);
ok('owner update cannot fake views/boost', after.views === 0 && after.top_until === null);
ok('price drop recorded in history', after.price_history.length === 1 && Number(after.price_history[0].price) === 5000);
ok('price edit keeps ad active', after.status === 'active');
await q(A, `update ads set title='BMW 320d xDrive' where id=$1`, [ad.id]);
ok('title edit returns to moderation', (await q(A, 'select status from ads where id=$1', [ad.id]))[0].status === 'pending');
await q(ADMIN, `select moderate_ad($1,true)`, [ad.id]);

ok('anon cannot read phones', await denied(null, 'select * from profile_contacts'));
ok('other user cannot read phones', (await q(B, 'select * from profile_contacts')).length === 0);
await q(A, `update ads set show_phone=true where id=$1`, [ad.id]);
ok('anon cannot reveal phone', await denied(null, 'select reveal_phone($1)', [ad.id]));
ok('logged-in user can reveal phone', (await q(B, 'select reveal_phone($1) p', [ad.id]))[0].p === '+37120000000');

ok('cannot self-promote to admin', await denied(A, `update profiles set role='admin' where id=$1`, [A]));
ok('cannot edit price list', (await q(A, `update prices set amount=0 where code='top' returning code`)).length === 0);
ok('other user cannot boost', await denied(B, `select apply_boost($1,'top')`, [ad.id]));
await q(A, `select apply_boost($1,'top')`, [ad.id]);
ok('boost really sets top_until', (await q(A, 'select top_until from ads where id=$1', [ad.id]))[0].top_until !== null);
await q(null, 'select add_view($1)', [ad.id]);
ok('view counter works for anon', (await q(A, 'select views from ads where id=$1', [ad.id]))[0].views === 1);
const [tx] = await q(A, 'select * from transactions');
ok('boost applied free in beta and logged', tx && Number(tx.charged) === 0 && Number(tx.list_price) === 2.99);
ok('other user cannot see transactions', (await q(B, 'select * from transactions')).length === 0);

await q(ADMIN, `update prices set amount=3.49 where code='top'`);
const ch = await q(null, 'select * from price_changes');
ok('price change is publicly logged', ch.length === 1 && Number(ch[0].new_amount) === 3.49);
ok('audit hidden from users', (await q(A, 'select * from audit_log')).length === 0);

const [th] = await q(B, `insert into threads (ad_id,buyer_id,seller_id) values ($1,$2,$3) returning *`, [ad.id, B, A]);
await q(B, `insert into messages (thread_id,sender_id,body) values ($1,$2,'Sveiki') `, [th.id, B]);
ok('seller reads message', (await q(A, 'select * from messages')).length === 1);
ok('outsider cannot read', (await q(OUT, 'select * from messages')).length === 0);
ok('cannot spoof sender', await denied(B, `insert into messages (thread_id,sender_id,body) values ($1,$2,'x')`, [th.id, A]));
ok('cannot fake seller on thread', await denied(B, `insert into threads (ad_id,buyer_id,seller_id) values ($1,$2,$2)`, [ad.id, B]));

await q(ADMIN, `select set_ban($1,true)`, [A]);
ok('ban pauses ads', (await q(null, `select search_ads() r`))[0].r.total === 0);
ok('banned user cannot post', await denied(A, `insert into ads (owner_id,title,category,subcategory,city) values ($1,'xxx','a','b','c')`, [A]));
ok('banned user cannot unban self', await denied(A, `update profiles set banned=false where id=$1`, [A]));
await db.exec(`insert into ads (owner_id,title,category,subcategory,city,status,expires_at) values ('${B}','Old ad','a','b','c','active',now()-interval '1 day')`);
ok('cron expiry works', (await db.query('select expire_ads() n')).rows[0].n === 1);
ok('anon cannot expire ads', await denied(null, 'select expire_ads()'));

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
