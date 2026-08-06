begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table('private', 'dashboard_users', 'dashboard allowlist exists');
select columns_are(
  'private',
  'dashboard_users',
  array['user_id', 'created_at'],
  'dashboard allowlist exposes only expected columns'
);
select ok(
  not has_table_privilege('anon', 'private.dashboard_users', 'SELECT'),
  'anonymous users cannot read the dashboard allowlist'
);
select ok(
  not has_table_privilege('authenticated', 'private.dashboard_users', 'SELECT'),
  'authenticated users cannot read the dashboard allowlist'
);
select ok(
  not has_table_privilege('authenticated', 'private.registrations', 'SELECT'),
  'authenticated users cannot read registrations directly'
);
select ok(
  not has_function_privilege('anon', 'public.list_registrations(integer,integer)', 'EXECUTE'),
  'anonymous users cannot execute registration listing'
);
select ok(
  has_function_privilege('authenticated', 'public.list_registrations(integer,integer)', 'EXECUTE'),
  'authenticated users can call the guarded listing RPC'
);
select ok(
  not has_function_privilege('anon', 'public.registration_summary()', 'EXECUTE'),
  'anonymous users cannot execute registration summary'
);
select ok(
  has_function_privilege('authenticated', 'public.registration_summary()', 'EXECUTE'),
  'authenticated users can call the guarded summary RPC'
);

delete from private.registrations;

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'viewer-test@example.com',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'outsider-test@example.com',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  )
on conflict (id) do nothing;

insert into private.dashboard_users (user_id)
values ('10000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

insert into private.registrations (first_name, last_name, party_size)
values ('Dashboard', 'Viewer', 2);

insert into private.registrations (first_name, last_name, party_size)
select 'Load' || value, 'DashboardTest', 1
from generate_series(1, 101) as value;

set local role authenticated;

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.list_registrations()$$,
  '42501',
  'Not authorized',
  'a request without a user id is refused'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.list_registrations()$$,
  '42501',
  'Not authorized',
  'an authenticated user outside the allowlist is refused'
);
select throws_ok(
  $$select * from public.registration_summary()$$,
  '42501',
  'Not authorized',
  'an outsider cannot read dashboard totals'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok(
  exists(
    select 1
    from public.list_registrations()
    where first_name = 'Dashboard' and last_name = 'Viewer'
  ),
  'an allowlisted user can read registrations'
);
select results_eq(
  $$select * from public.registration_summary()$$,
  $$values (102::bigint, 103::bigint)$$,
  'an allowlisted user receives exact totals'
);
select is(
  (select count(*) from public.list_registrations(500, 0)),
  100::bigint,
  'listing limit is clamped to 100'
);
select throws_ok(
  $$select * from public.list_registrations(50, -1)$$,
  '22023',
  'Invalid pagination offset',
  'invalid pagination offsets are rejected instead of repeated'
);

select * from finish();
rollback;
