create table private.dashboard_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.dashboard_users enable row level security;
alter table private.dashboard_users force row level security;

revoke all on table private.dashboard_users from public, anon, authenticated;

create or replace function public.list_registrations(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  first_name text,
  last_name text,
  party_size integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from private.dashboard_users
    where user_id = auth.uid()
  ) then
    raise insufficient_privilege using message = 'Not authorized';
  end if;

  if coalesce(p_offset, 0) < 0 or coalesce(p_offset, 0) > 10000 then
    raise invalid_parameter_value using message = 'Invalid pagination offset';
  end if;

  return query
  select
    registrations.first_name,
    registrations.last_name,
    registrations.party_size,
    registrations.created_at
  from private.registrations as registrations
  order by registrations.created_at desc, registrations.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset coalesce(p_offset, 0);
end;
$$;

create or replace function public.registration_summary()
returns table (
  registration_count bigint,
  participant_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from private.dashboard_users
    where user_id = auth.uid()
  ) then
    raise insufficient_privilege using message = 'Not authorized';
  end if;

  return query
  select
    count(*)::bigint,
    coalesce(sum(registrations.party_size), 0)::bigint
  from private.registrations as registrations;
end;
$$;

revoke all on function public.list_registrations(integer, integer)
  from public, anon;
grant execute on function public.list_registrations(integer, integer)
  to authenticated;

revoke all on function public.registration_summary()
  from public, anon;
grant execute on function public.registration_summary()
  to authenticated;

comment on table private.dashboard_users is
  'Explicit allowlist for the read-only registration dashboard.';
comment on function public.list_registrations(integer, integer) is
  'Returns a bounded registration page to allowlisted authenticated users.';
comment on function public.registration_summary() is
  'Returns registration totals to allowlisted authenticated users.';
