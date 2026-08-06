create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table private.registrations (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  party_size integer not null,
  normalized_first_name text generated always as (
    lower(regexp_replace(btrim(first_name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  normalized_last_name text generated always as (
    lower(regexp_replace(btrim(last_name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  created_at timestamptz not null default now(),
  constraint registrations_first_name_length check (char_length(first_name) between 1 and 50),
  constraint registrations_last_name_length check (char_length(last_name) between 1 and 50),
  constraint registrations_first_name_trimmed check (first_name = btrim(first_name)),
  constraint registrations_last_name_trimmed check (last_name = btrim(last_name)),
  constraint registrations_first_name_safe check (first_name !~ '[[:cntrl:]<>]'),
  constraint registrations_last_name_safe check (last_name !~ '[[:cntrl:]<>]'),
  constraint registrations_party_size check (party_size between 1 and 10),
  constraint registrations_unique_guest unique (normalized_first_name, normalized_last_name)
);

alter table private.registrations enable row level security;
alter table private.registrations force row level security;

revoke all on table private.registrations from public, anon, authenticated;

create table private.registration_rate_limits (
  client_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null,
  constraint registration_rate_limits_hash check (client_hash ~ '^[0-9a-f]{64}$'),
  constraint registration_rate_limits_attempts check (attempts between 1 and 6)
);

create index registration_rate_limits_expiry_idx
  on private.registration_rate_limits (window_started_at);

alter table private.registration_rate_limits enable row level security;
alter table private.registration_rate_limits force row level security;

revoke all on table private.registration_rate_limits from public, anon, authenticated;

create or replace function public.consume_registration_attempt(
  p_client_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  attempt_count integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  delete from private.registration_rate_limits
  where window_started_at < statement_timestamp() - interval '10 minutes';

  insert into private.registration_rate_limits as limits (
    client_hash,
    window_started_at,
    attempts
  )
  values (p_client_hash, statement_timestamp(), 1)
  on conflict (client_hash) do update
  set window_started_at = case
      when limits.window_started_at < statement_timestamp() - interval '10 minutes'
        then statement_timestamp()
      else limits.window_started_at
    end,
    attempts = case
      when limits.window_started_at < statement_timestamp() - interval '10 minutes' then 1
      else least(limits.attempts + 1, 6)
    end
  returning attempts into attempt_count;

  return attempt_count <= 5;
end;
$$;

revoke all on function public.consume_registration_attempt(text)
  from public, anon, authenticated;
grant execute on function public.consume_registration_attempt(text)
  to service_role;

create or replace function public.register_guest(
  p_first_name text,
  p_last_name text,
  p_party_size integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  cleaned_first_name text;
  cleaned_last_name text;
  inserted_count integer;
begin
  cleaned_first_name := regexp_replace(btrim(p_first_name), '[[:space:]]+', ' ', 'g');
  cleaned_last_name := regexp_replace(btrim(p_last_name), '[[:space:]]+', ' ', 'g');

  if cleaned_first_name is null
    or char_length(cleaned_first_name) not between 1 and 50
    or cleaned_first_name ~ '[[:cntrl:]<>]'
    or cleaned_last_name is null
    or char_length(cleaned_last_name) not between 1 and 50
    or cleaned_last_name ~ '[[:cntrl:]<>]'
    or p_party_size is null
    or p_party_size not between 1 and 10
  then
    return 'invalid';
  end if;

  insert into private.registrations (first_name, last_name, party_size)
  values (cleaned_first_name, cleaned_last_name, p_party_size)
  on conflict (normalized_first_name, normalized_last_name) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return 'duplicate';
  end if;

  return 'created';
end;
$$;

revoke all on function public.register_guest(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.register_guest(text, text, integer)
  to service_role;

comment on function public.consume_registration_attempt(text) is
  'Consumes one rate-limit attempt before any external challenge verification.';
comment on function public.register_guest(text, text, integer) is
  'Validates and atomically creates a private event registration.';
