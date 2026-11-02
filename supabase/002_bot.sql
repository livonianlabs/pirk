-- Moderation bot: publishes clean ads at once, holds doubtful ones for a human.
-- It never rejects. It reads text and numbers only; it cannot see photos.

alter table ads add column bot_note text;
alter table ads add column mod_source text check (mod_source in ('bot','human','reports'));

create table bot_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  max_ads_per_day integer not null default 10 check (max_ads_per_day > 0),
  low_price_ratio numeric not null default 0.4 check (low_price_ratio between 0 and 1),
  reports_to_hide integer not null default 3 check (reports_to_hide > 0)
);
insert into bot_settings default values;

-- Matched against lowercase text without Latvian diacritics, prefixed with "cat:<category>".
create table bot_rules (
  id bigserial primary key,
  pattern text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create function check_bot_rule() returns trigger
language plpgsql set search_path = public as $$
begin
  perform '' ~ new.pattern;  -- an invalid regex fails here, not on every later ad
  return new;
end $$;
create trigger check_bot_rule before insert or update on bot_rules
  for each row execute function check_bot_rule();

insert into bot_rules (pattern, reason) values
  ('https?://|www\.|\y[a-z0-9-]+\.(com|lv|ru|net|org|eu|io)\y|t\.me|telegram|whatsapp', 'Saite vai saziņa ārpus platformas'),
  ('ieroc|ierok|pistol|patron|granat|пистолет|оруж|патрон|гранат|ружь', 'Ieroči vai munīcija'),
  ('narkot|marihuan|kanep|kokain|amfetamin|наркот|марихуан|кокаин|амфетамин|мефедрон|спайс', 'Narkotikas'),
  ('ozempic|viagra|recepsu|виагр|антибиотик|снотворн|рецептурн', 'Medikamenti'),
  ('replik|viltojum|реплик|подделк|копия бренд|люкс копия', 'Iespējams viltojums'),
  ('viltot|diplom|apliecib|диплом|справк|водительские права', 'Dokumenti'),
  ('intim|eskort|интим|эскорт', 'Pieaugušo saturs'),
  ('kripto|bitcoin|investic|aizdevum|kredit|darbs no majam|крипт|биткоин|инвестиц|займ|кредит|работа на дому|быстрый заработок', 'Finanses vai ātra peļņa'),
  ('priekapmaks|prieksapmaks|предоплат', 'Prasa priekšapmaksu'),
  ('cat:jobs', 'Darba sludinājumi: augsts krāpšanas risks'),
  ('cat:animals', 'Dzīvnieku tirdzniecība');

create function norm_text(t text) returns text language sql immutable as $$
  select translate(lower(t), 'āčēģīķļņšūž', 'acegiklnsuz')
$$;

-- Edited or resubmitted content goes back through review; users cannot touch moderation fields.
create or replace function guard_ad() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon','authenticated') or is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.views := 0; new.top_until := null;
    new.highlight_until := null; new.reject_reason := null; new.bumped_at := now();
    new.created_at := now(); new.expires_at := now() + interval '60 days';
    new.price_history := '[]'; new.bot_note := null; new.mod_source := null;
    return new;
  end if;
  new.owner_id := old.owner_id; new.views := old.views;
  new.top_until := old.top_until; new.highlight_until := old.highlight_until;
  new.bumped_at := old.bumped_at; new.created_at := old.created_at;
  new.expires_at := old.expires_at; new.reject_reason := old.reject_reason;
  new.price_history := old.price_history; new.bot_note := old.bot_note; new.mod_source := old.mod_source;
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
  -- A paused ad hidden by reports or a ban must not be able to reappear by itself.
  if old.status = 'paused' and new.status = 'active' and is_banned() then
    raise exception 'forbidden status change';
  end if;
  if old.status <> 'pending' and (new.title <> old.title or new.description <> old.description
       or new.photos <> old.photos or new.attrs <> old.attrs or new.category <> old.category) then
    new.status := 'pending';
  end if;
  return new;
end $$;

-- A trigger function, so it cannot be called directly as an RPC. Fires after guard_ad by name order.
create function zz_bot_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg bot_settings; hay text; hit text; n integer; med numeric; reason text;
begin
  -- A report hold stays with a human, whoever edits the ad afterwards.
  if new.status <> 'pending' or new.mod_source = 'reports' then return new; end if;
  if tg_op = 'UPDATE' then
    -- Only new submissions and content edits; never undo a report hold or a human decision.
    if old.status = 'pending' and new.title = old.title and new.description = old.description
       and new.photos = old.photos and new.attrs = old.attrs and new.category = old.category then
      return new;
    end if;
  end if;
  select * into cfg from bot_settings;
  if not cfg.enabled then new.bot_note := null; return new; end if;

  begin
    if tg_op = 'UPDATE' and old.status = 'rejected' and old.mod_source = 'human' then
      reason := 'Atkārtoti iesniegts pēc noraidīšanas';
    end if;

    if reason is null then
      hay := 'cat:' || new.category || ' ' || norm_text(new.title || ' ' || new.description || ' ' || new.attrs::text);
      select r.reason into hit from bot_rules r where hay ~ r.pattern order by r.id limit 1;
      reason := hit;
    end if;

    if reason is null then
      select count(*) into n from ads where owner_id = new.owner_id and id <> new.id
        and created_at > now() - interval '24 hours';
      if n >= cfg.max_ads_per_day then reason := 'Pārāk daudz sludinājumu 24 stundās'; end if;
    end if;

    if reason is null and exists (select 1 from ads where owner_id = new.owner_id and id <> new.id
        and status in ('active','pending','paused') and norm_text(title) = norm_text(new.title)) then
      reason := 'Iespējams dublikāts';
    end if;

    -- Suspiciously cheap against at least 4 comparable ads: a classic scam signal.
    if reason is null and new.price > 0 then
      select percentile_cont(0.5) within group (order by price), count(*) into med, n
        from ads where status = 'active' and subcategory = new.subcategory and id <> new.id and price > 0
          and (new.attrs->>'brand' is null or lower(attrs->>'brand') = lower(new.attrs->>'brand'));
      if n >= 4 and new.price < med * cfg.low_price_ratio then
        reason := 'Aizdomīgi zema cena pret ' || n || ' līdzīgiem';
      end if;
    end if;
  exception when others then
    reason := 'Bota kļūda: nepieciešama pārbaude';
  end;

  if reason is null then
    new.status := 'active'; new.mod_source := 'bot'; new.bot_note := null; new.bumped_at := now();
    new.expires_at := now() + interval '60 days'; new.reject_reason := null;
    insert into audit_log (actor_id, action, target) values (null, 'bot_approve', new.id::text);
  else
    new.bot_note := reason; new.mod_source := null;
    insert into audit_log (actor_id, action, target, note) values (null, 'bot_hold', new.id::text, reason);
  end if;
  return new;
end $$;
create trigger zz_bot_review before insert or update on ads
  for each row execute function zz_bot_review();

create or replace function moderate_ad(p_ad uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update ads set status = case when p_approve then 'active'::ad_status else 'rejected'::ad_status end,
    reject_reason = case when p_approve then null else p_reason end,
    bumped_at = case when p_approve then now() else bumped_at end,
    expires_at = case when p_approve then greatest(expires_at, now() + interval '60 days') else expires_at end,
    bot_note = null, mod_source = 'human'
  where id = p_ad;
  insert into audit_log (actor_id, action, target, note)
    values (auth.uid(), case when p_approve then 'approve' else 'reject' end, p_ad::text, p_reason);
end $$;

-- Several logged-in users reporting one ad hides it until a human looks.
create function hide_reported_ad() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg bot_settings; n integer;
begin
  select * into cfg from bot_settings;
  select count(distinct reporter_id) into n from reports
    where ad_id = new.ad_id and status = 'open' and reporter_id is not null;
  if cfg.enabled and n >= cfg.reports_to_hide then
    update ads set status = 'pending', mod_source = 'reports', bot_note = 'Sūdzības: ' || n
      where id = new.ad_id and status = 'active';
    if found then
      insert into audit_log (actor_id, action, target, note) values (null, 'bot_hide', new.ad_id::text, 'reports: ' || n);
    end if;
  end if;
  return new;
end $$;
create trigger hide_reported_ad after insert on reports
  for each row execute function hide_reported_ad();

alter table bot_settings enable row level security;
alter table bot_rules enable row level security;
create policy bot_settings_admin on bot_settings for all using (is_admin()) with check (is_admin());
create policy bot_rules_admin on bot_rules for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on bot_settings, bot_rules to authenticated;
grant usage on sequence bot_rules_id_seq to authenticated;
grant execute on function norm_text(text) to anon, authenticated;
