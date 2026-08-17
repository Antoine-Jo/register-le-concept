import { createClient } from "@supabase/supabase-js";

import {
  allowlistLocalDashboardUser,
  getLocalSupabaseEnvironment,
} from "./local-supabase.mjs";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error("Usage: npm run admin:create -- admin@example.com");
}

const environment = getLocalSupabaseEnvironment();
const admin = createClient(environment.API_URL, environment.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: usersData, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listError) throw listError;

let user = usersData.users.find((candidate) => candidate.email?.toLowerCase() === email);
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Unable to create local admin");
  user = data.user;
}

allowlistLocalDashboardUser(user.id);

console.log(`Local dashboard access granted to ${email}.`);
console.log(`Magic links are available at ${environment.MAILPIT_URL}.`);
