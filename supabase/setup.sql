-- Fitness HQ cloud sync. Paste all of this into Supabase > SQL Editor and press Run.
-- Safe to run again.

-- 1) Synced records: one row per workout, food entry, measurement, check-in, etc.
create table if not exists public.fhq_records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tbl text not null,
  key text not null,
  data jsonb,
  deleted boolean not null default false,
  mt bigint not null,
  server_ts timestamptz not null default now(),
  primary key (user_id, tbl, key)
);
create index if not exists fhq_records_pull on public.fhq_records (user_id, server_ts);
alter table public.fhq_records enable row level security;
drop policy if exists "own records" on public.fhq_records;
create policy "own records" on public.fhq_records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.fhq_records to authenticated;

-- Stamp the server time on every write, and never let an older copy overwrite a newer one.
create or replace function public.fhq_records_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.mt < old.mt then
    return null;
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;
drop trigger if exists fhq_records_touch on public.fhq_records;
create trigger fhq_records_touch before insert or update on public.fhq_records
  for each row execute function public.fhq_records_touch();

-- 2) Apple Health inbox: the iPhone Shortcut drops weight and steps here.
create table if not exists public.fhq_ingest_tokens (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.fhq_ingest_tokens enable row level security;
drop policy if exists "own tokens" on public.fhq_ingest_tokens;
create policy "own tokens" on public.fhq_ingest_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.fhq_ingest_tokens to authenticated;

create table if not exists public.fhq_health_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.fhq_health_inbox enable row level security;
drop policy if exists "own inbox" on public.fhq_health_inbox;
create policy "own inbox" on public.fhq_health_inbox for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, delete on public.fhq_health_inbox to authenticated;

-- The Shortcut calls this with its secret token. It can only add to that account's inbox.
create or replace function public.fhq_health_ingest(token text, date text default null, weight text default null, steps text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select t.user_id into uid from public.fhq_ingest_tokens t where t.token = fhq_health_ingest.token;
  if uid is null then
    raise exception 'Unknown token. Make a new one in Fitness HQ > Settings > Apple Health.';
  end if;
  insert into public.fhq_health_inbox (user_id, payload)
  values (uid, jsonb_build_object('date', left(date, 40), 'weight', left(weight, 40), 'steps', left(steps, 40)));
  return 'Sent to Fitness HQ';
end $$;
revoke all on function public.fhq_health_ingest(text, text, text, text) from public;
grant execute on function public.fhq_health_ingest(text, text, text, text) to anon, authenticated;

-- 3) Coach access: a read-only key you can share with your coach (Claude) and revoke any time.
--    It can only read this account's synced records. It cannot write, delete or sign in.
create table if not exists public.fhq_coach_tokens (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.fhq_coach_tokens enable row level security;
drop policy if exists "own coach tokens" on public.fhq_coach_tokens;
create policy "own coach tokens" on public.fhq_coach_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.fhq_coach_tokens to authenticated;

create or replace function public.fhq_coach_read(token text, since timestamptz default '1970-01-01')
returns table (tbl text, key text, data jsonb, deleted boolean, mt bigint, server_ts timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid;
begin
  select t.user_id into uid from public.fhq_coach_tokens t where t.token = fhq_coach_read.token;
  if uid is null then
    raise exception 'Unknown or revoked coach key';
  end if;
  return query
    select r.tbl, r.key, r.data, r.deleted, r.mt, r.server_ts
    from public.fhq_records r
    where r.user_id = uid and r.server_ts >= since
    order by r.server_ts;
end $$;
revoke all on function public.fhq_coach_read(text, timestamptz) from public;
grant execute on function public.fhq_coach_read(text, timestamptz) to anon, authenticated;

-- 4) Coach notes: the coach key can also write post-workout notes, next-session weights and
--    new calorie targets. It can only write records of type 'coach', never your logs.
create or replace function public.fhq_coach_write(token text, key text, data jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid; k text; d jsonb;
begin
  select t.user_id into uid from public.fhq_coach_tokens t where t.token = fhq_coach_write.token;
  if uid is null then
    raise exception 'Unknown or revoked coach key';
  end if;
  k := fhq_coach_write.key;
  d := fhq_coach_write.data;
  if k is null or length(k) > 200 or not (k like 'override:%' or k like 'summary:%' or k = 'targets') then
    raise exception 'Coach can only write override:*, summary:* or targets';
  end if;
  if pg_column_size(d) > 20000 then
    raise exception 'Coach note too large';
  end if;
  insert into public.fhq_records as r (user_id, tbl, key, data, deleted, mt)
  values (uid, 'coach', k, d || jsonb_build_object('key', k), d is null, (extract(epoch from clock_timestamp()) * 1000)::bigint)
  on conflict on constraint fhq_records_pkey do update
    set data = excluded.data, deleted = excluded.deleted, mt = excluded.mt;
  return 'ok';
end $$;
revoke all on function public.fhq_coach_write(text, text, jsonb) from public;
grant execute on function public.fhq_coach_write(text, text, jsonb) to anon, authenticated;
