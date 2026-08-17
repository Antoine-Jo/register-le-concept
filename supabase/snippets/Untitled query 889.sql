select
  first_name,
  last_name,
  party_size,
  created_at
from private.registrations
order by created_at desc;