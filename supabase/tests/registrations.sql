begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

-- Keep assertions deterministic while restoring any pre-existing local data on rollback.
delete from private.registrations
where normalized_first_name = 'jeanne' and normalized_last_name = 'd''arc';
delete from private.registration_rate_limits
where client_hash = repeat('e', 64);

select has_schema('private', 'private schema exists');
select has_table('private', 'registrations', 'registrations table exists');
select has_table('private', 'registration_rate_limits', 'rate limit table exists');
select has_function(
  'public',
  'register_guest',
  array['text', 'text', 'integer'],
  'controlled registration function exists'
);
select has_function(
  'public',
  'consume_registration_attempt',
  array['text'],
  'controlled rate-limit function exists'
);

select ok(
  not has_table_privilege('anon', 'private.registrations', 'SELECT'),
  'anonymous users cannot read registrations'
);
select ok(
  not has_table_privilege('anon', 'private.registrations', 'INSERT'),
  'anonymous users cannot insert registrations directly'
);
select ok(
  not has_table_privilege('authenticated', 'private.registrations', 'UPDATE'),
  'authenticated users cannot update registrations'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.register_guest(text,text,integer)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the registration function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.consume_registration_attempt(text)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the rate-limit function'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.register_guest(text,text,integer)',
    'EXECUTE'
  ),
  'service role can execute the registration function'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_registration_attempt(text)',
    'EXECUTE'
  ),
  'service role can execute the rate-limit function'
);

select is(
  public.register_guest('  Jeanne  ', '  D''Arc  ', 2),
  'created',
  'a valid registration is created'
);
select results_eq(
  $$select first_name, last_name, party_size from private.registrations where normalized_first_name = 'jeanne' and normalized_last_name = 'd''arc'$$,
  $$values ('Jeanne'::text, 'D''Arc'::text, 2)$$,
  'stored values are normalized'
);
select is(
  public.register_guest('JEANNE', 'd''arc', 3),
  'duplicate',
  'duplicate detection ignores casing'
);
select is(
  public.register_guest('<script>', 'Dupont', 1),
  'invalid',
  'unsafe names are rejected in the database'
);
select is(
  public.register_guest('Paul', 'Dupont', 11),
  'invalid',
  'invalid party sizes are rejected in the database'
);

select is(public.consume_registration_attempt(repeat('e', 64)), true, 'rate attempt 1 passes');
select is(public.consume_registration_attempt(repeat('e', 64)), true, 'rate attempt 2 passes');
select is(public.consume_registration_attempt(repeat('e', 64)), true, 'rate attempt 3 passes');
select is(public.consume_registration_attempt(repeat('e', 64)), true, 'rate attempt 4 passes');
select is(public.consume_registration_attempt(repeat('e', 64)), true, 'rate attempt 5 passes');
select is(
  public.consume_registration_attempt(repeat('e', 64)),
  false,
  'rate attempt 6 is rejected'
);

select * from finish();
rollback;
