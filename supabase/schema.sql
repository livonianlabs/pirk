-- Pērc vai pārdod: database schema, row-level security and RPCs (Supabase / Postgres).
-- All authorization lives here: the browser is untrusted.

create type ad_status as enum ('pending','active','paused','rejected','expired','sold');
create type report_status as enum ('open','resolved','dismissed');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Lietotājs' check (char_length(display_name) <= 60),
  city text,
  role text not null default 'user' check (role in ('user','admin')),
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Private columns are a separate table, because RLS cannot hide single columns.
create table profile_contacts (
  user_id uuid primary key references profiles on delete cascade,
  phone text check (char_length(phone) <= 30)
);

create table ads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  title text not null check (char_length(title) between 3 and 90),
  description text not null default '' check (char_length(description) <= 5000),
  price numeric(12,2) check (price is null or price >= 0),
  category text not null,
  subcategory text not null,
  city text not null,
  lat double precision,
  lng double precision,
  attrs jsonb not null default '{}',
  photos text[] not null default '{}' check (cardinality(photos) <= 12),
  show_phone boolean not null default false,
  status ad_status not null default 'pending',
  reject_reason text,
  views integer not null default 0,
  top_until timestamptz,
  highlight_until timestamptz,
  bumped_at timestamptz not null default now(),
  price_history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  search_text text generated always as (
    translate(lower(title || ' ' || description || ' ' || city),
      'āčēģīķļņšūž', 'acegiklnsuz')
  ) stored
);
create index ads_feed_idx on ads (status, category, subcategory, bumped_at desc);
create index ads_owner_idx on ads (owner_id);

create table favorites (
  user_id uuid not null references profiles on delete cascade,
  ad_id uuid not null references ads on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, ad_id)
);

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  label text not null,
  query text not null,
  created_at timestamptz not null default now()
);

create table threads (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads on delete cascade,
  buyer_id uuid not null references profiles on delete cascade,
  seller_id uuid not null references profiles on delete cascade,
  updated_at timestamptz not null default now(),
  unique (ad_id, buyer_id),
  check (buyer_id <> seller_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads on delete cascade,
  sender_id uuid not null references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads on delete cascade,
  reporter_id uuid references profiles on delete set null,
  reason text not null,
  details text check (char_length(details) <= 1000),
  status report_status not null default 'open',
  created_at timestamptz not null default now()
);

-- The public price list. Every change is logged and publicly readable.
create table prices (
  code text primary key,
  amount numeric(8,2) not null check (amount >= 0),
  days integer not null default 0,
  updated_at timestamptz not null default now()
);
create table price_changes (
  id bigserial primary key,
  code text not null,
  old_amount numeric(8,2),
  new_amount numeric(8,2) not null,
  created_at timestamptz not null default now()
);
insert into prices (code, amount, days) values
  ('top', 2.99, 7), ('highlight', 0.99, 7), ('bump', 0.49, 0);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  ad_id uuid references ads on delete set null,
  code text not null,
  list_price numeric(8,2) not null,
  charged numeric(8,2) not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  target text,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- helpers ----------
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
$$;

create function is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned from profiles where id = auth.uid()), false)
$$;

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Never derive the public name from the email address.
  insert into profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Users may not promote themselves or lift their own ban.
-- Guards run as the caller, so trusted RPCs and the SQL console (owner role) pass through.
create function guard_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon','authenticated') and not is_admin() and (new.role <> old.role or new.banned <> old.banned) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;
create trigger guard_profile before update on profiles
  for each row execute function guard_profile();

-- Users cannot self-approve, self-boost or fake view counts.
create function guard_ad() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon','authenticated') or is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.views := 0; new.top_until := null;
    new.highlight_until := null; new.reject_reason := null; new.bumped_at := now();
    new.created_at := now(); new.expires_at := now() + interval '60 days';
    new.price_history := '[]';
    return new;
  end if;
  new.owner_id := old.owner_id; new.views := old.views;
  new.top_until := old.top_until; new.highlight_until := old.highlight_until;
  new.bumped_at := old.bumped_at; new.created_at := old.created_at;
  new.expires_at := old.expires_at; new.reject_reason := old.reject_reason;
  new.price_history := old.price_history;
  if new.price is distinct from old.price then
    new.price_history := old.price_history || jsonb_build_object('at', now(), 'price', old.price);
  end if;
  if new.status <> old.status and not (
       (old.status = 'active' and new.status in ('paused','sold'))
    or (old.status = 'paused' and new.status in ('active','sold'))
    or (old.status in ('rejected','expired') and new.status = 'pending')
  ) then
    raise exception 'forbidden status change';
  end if;
  -- Edited content goes back through moderation.
  if old.status <> 'pending' and (new.title <> old.title or new.description <> old.description
       or new.photos <> old.photos) then
    new.status := 'pending';
  end if;
  return new;
end $$;
create trigger guard_ad before insert or update on ads
  for each row execute function guard_ad();

create function touch_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update threads set updated_at = now() where id = new.thread_id;
  return new;
end $$;
create trigger touch_thread after insert on messages
  for each row execute function touch_thread();

create function log_price_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.amount <> old.amount then
    new.updated_at := now();
    insert into price_changes (code, old_amount, new_amount) values (new.code, old.amount, new.amount);
    insert into audit_log (actor_id, action, target, note)
      values (auth.uid(), 'price_change', new.code, old.amount || ' -> ' || new.amount);
  end if;
  return new;
end $$;
create trigger log_price_change before update on prices
  for each row execute function log_price_change();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table profile_contacts enable row level security;
alter table ads enable row level security;
alter table favorites enable row level security;
alter table saved_searches enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table reports enable row level security;
alter table prices enable row level security;
alter table price_changes enable row level security;
alter table transactions enable row level security;
alter table audit_log enable row level security;

create policy profiles_read on profiles for select using (true);
create policy profiles_update on profiles for update
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

create policy contacts_own on profile_contacts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ads_read on ads for select
  using ((status in ('active','sold') and expires_at > now()) or owner_id = auth.uid() or is_admin());
create policy ads_insert on ads for insert
  with check (owner_id = auth.uid() and not is_banned());
create policy ads_update on ads for update
  using ((owner_id = auth.uid() and not is_banned()) or is_admin())
  with check (owner_id = auth.uid() or is_admin());
create policy ads_delete on ads for delete using (owner_id = auth.uid() or is_admin());

create policy fav_own on favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saved_own on saved_searches for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy threads_read on threads for select
  using (auth.uid() in (buyer_id, seller_id) or is_admin());
create policy threads_insert on threads for insert with check (
  buyer_id = auth.uid() and not is_banned()
  and seller_id = (select owner_id from ads where id = ad_id)
);
create policy messages_read on messages for select using (
  exists (select 1 from threads t where t.id = thread_id
          and (auth.uid() in (t.buyer_id, t.seller_id) or is_admin()))
);
create policy messages_insert on messages for insert with check (
  sender_id = auth.uid() and not is_banned() and exists (
    select 1 from threads t where t.id = thread_id and auth.uid() in (t.buyer_id, t.seller_id))
);

create policy reports_insert on reports for insert
  with check (reporter_id is null or reporter_id = auth.uid());
create policy reports_admin on reports for select using (is_admin());
create policy reports_admin_upd on reports for update using (is_admin());

create policy prices_read on prices for select using (true);
create policy prices_admin on prices for update using (is_admin());
create policy price_changes_read on price_changes for select using (true);

create policy tx_read on transactions for select using (user_id = auth.uid() or is_admin());
create policy audit_read on audit_log for select using (is_admin());

-- ---------- RPCs ----------
create function search_ads(
  p_q text default null, p_category text default null, p_subcategory text default null,
  p_city text default null, p_min numeric default null, p_max numeric default null,
  p_attrs jsonb default '{}', p_with_photo boolean default false,
  p_sort text default 'new', p_limit integer default 24, p_offset integer default 0
) returns jsonb language sql stable set search_path = public as $$
  with hits as (
    select a.* from ads a
    where a.status = 'active' and a.expires_at > now()
      and (p_category is null or a.category = p_category)
      and (p_subcategory is null or a.subcategory = p_subcategory)
      and (p_city is null or a.city = p_city)
      and (p_min is null or a.price >= p_min)
      and (p_max is null or a.price <= p_max)
      and (not p_with_photo or cardinality(a.photos) > 0)
      and (p_q is null or not exists (
        select 1 from unnest(string_to_array(
          translate(lower(trim(p_q)), 'āčēģīķļņšūž', 'acegiklnsuz'), ' ')) w
        where w <> '' and position(w in a.search_text) = 0))
      and not exists (
        select 1 from jsonb_each(coalesce(p_attrs, '{}')) f where not (
          (f.value->>'eq' is null or a.attrs->>f.key = f.value->>'eq')
          and (f.value->>'min' is null or (a.attrs->>f.key ~ '^[0-9.]+$'
               and (a.attrs->>f.key)::numeric >= (f.value->>'min')::numeric))
          and (f.value->>'max' is null or (a.attrs->>f.key ~ '^[0-9.]+$'
               and (a.attrs->>f.key)::numeric <= (f.value->>'max')::numeric))))
  ), page as (
    select h.* from hits h
    order by
      case when p_sort = 'new' and h.top_until > now() then 0 else 1 end,
      case when p_sort = 'cheap' then h.price end asc nulls last,
      case when p_sort = 'expensive' then h.price end desc nulls last,
      h.bumped_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'items', coalesce((
      select jsonb_agg(to_jsonb(p) - 'search_text' || jsonb_build_object('owner_name', o.display_name))
      from page p join profiles o on o.id = p.owner_id), '[]'))
$$;

-- Phone numbers are never in the public payload: logged-in reveal only, resists scraping.
create function reveal_phone(p_ad uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select c.phone into r from ads a join profile_contacts c on c.user_id = a.owner_id
    where a.id = p_ad and a.show_phone and a.status = 'active';
  return r;
end $$;

create function add_view(p_ad uuid) returns void
language sql security definer set search_path = public as $$
  update ads set views = views + 1 where id = p_ad and status = 'active';
$$;

-- Beta: promotion works, nothing is charged. Payments replace `charged` after launch.
create function apply_boost(p_ad uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare pr prices;
begin
  select * into pr from prices where code = p_code;
  if pr is null then raise exception 'unknown product'; end if;
  if not exists (select 1 from ads where id = p_ad and owner_id = auth.uid() and status = 'active') then
    raise exception 'forbidden';
  end if;
  update ads set
    top_until = case when p_code = 'top' then greatest(coalesce(top_until, now()), now()) + make_interval(days => pr.days) else top_until end,
    highlight_until = case when p_code = 'highlight' then greatest(coalesce(highlight_until, now()), now()) + make_interval(days => pr.days) else highlight_until end,
    bumped_at = case when p_code = 'bump' then now() else bumped_at end
  where id = p_ad;
  insert into transactions (user_id, ad_id, code, list_price, charged)
    values (auth.uid(), p_ad, p_code, pr.amount, 0);
end $$;

create function moderate_ad(p_ad uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update ads set status = case when p_approve then 'active'::ad_status else 'rejected'::ad_status end,
    reject_reason = case when p_approve then null else p_reason end,
    bumped_at = case when p_approve then now() else bumped_at end
  where id = p_ad;
  insert into audit_log (actor_id, action, target, note)
    values (auth.uid(), case when p_approve then 'approve' else 'reject' end, p_ad::text, p_reason);
end $$;

create function set_ban(p_user uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update profiles set banned = p_banned where id = p_user;
  if p_banned then update ads set status = 'paused' where owner_id = p_user and status = 'active'; end if;
  insert into audit_log (actor_id, action, target) values (auth.uid(), case when p_banned then 'ban' else 'unban' end, p_user::text);
end $$;

-- Call daily with pg_cron: select expire_ads();
create function expire_ads() returns integer
language sql security definer set search_path = public as $$
  with x as (update ads set status = 'expired' where status = 'active' and expires_at <= now() returning 1)
  select count(*)::integer from x;
$$;
revoke execute on function expire_ads() from public, anon, authenticated;

-- Photos: public read, each user writes only inside a folder named with their id.
insert into storage.buckets (id, name, public) values ('ad-photos', 'ad-photos', true);
create policy photos_read on storage.objects for select using (bucket_id = 'ad-photos');
create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-photos' and (storage.foldername(name))[1] = auth.uid()::text and not is_banned());
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ad-photos' and (storage.foldername(name))[1] = auth.uid()::text);

grant usage on schema public to anon, authenticated;
grant select on profiles, ads, prices, price_changes to anon;
grant insert on reports to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Explicit, so the schema works when the project does not auto-expose new objects.
grant execute on function is_admin(), is_banned(), search_ads(text,text,text,text,numeric,numeric,jsonb,boolean,text,integer,integer), reveal_phone(uuid), add_view(uuid), apply_boost(uuid,text), moderate_ad(uuid,boolean,text), set_ban(uuid,boolean) to anon, authenticated;
