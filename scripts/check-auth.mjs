import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

import {
  allowlistLocalDashboardUser,
  getLocalSupabaseEnvironment,
} from "./local-supabase.mjs";

const environment = getLocalSupabaseEnvironment();
const email = `dashboard-auth-${Date.now()}@example.com`;
const callbackUrl = "http://localhost:5173/auth/callback/";
const admin = createClient(environment.API_URL, environment.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (createError || !created.user) throw createError ?? new Error("Unable to create auth fixture");

allowlistLocalDashboardUser(created.user.id);

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
const client = createClient(environment.API_URL, environment.PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: "pkce",
    persistSession: true,
    storage,
  },
});

try {
  const { error: otpError } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl, shouldCreateUser: false },
  });
  assert.equal(otpError, null, "an existing admin must receive a magic link");

  let message;
  for (let attempt = 0; attempt < 20 && !message; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const response = await fetch(`${environment.MAILPIT_URL}/api/v1/messages`);
    const mailbox = await response.json();
    message = mailbox.messages.find((candidate) =>
      candidate.To.some((recipient) => recipient.Address === email)
    );
  }
  assert.ok(message, "Mailpit must receive the admin magic link");

  const messageResponse = await fetch(`${environment.MAILPIT_URL}/api/v1/message/${message.ID}`);
  const messageBody = await messageResponse.json();
  const emailContent = `${messageBody.Text}\n${messageBody.HTML}`.replaceAll("&amp;", "&");
  const actionLink = emailContent.match(
    /https?:\/\/[^\s"'<>)]*\/auth\/v1\/verify\?[^\s"'<>)]*/u,
  )?.[0];
  assert.ok(actionLink, "the auth email must contain a sign-in link");

  const verification = await fetch(actionLink, { redirect: "manual" });
  const location = verification.headers.get("location");
  assert.ok(location, "the verification endpoint must redirect to the callback");

  const redirect = new URL(location);
  assert.equal(`${redirect.origin}${redirect.pathname}`, callbackUrl);
  const code = redirect.searchParams.get("code");
  assert.ok(code, "the PKCE callback must contain an authorization code");

  const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
  assert.equal(exchangeError, null, "the PKCE code must create a session");

  const { error: dashboardError } = await client.rpc("registration_summary");
  assert.equal(dashboardError, null, "an allowlisted authenticated user can read the dashboard");

  const unknownEmail = `unknown-${Date.now()}@example.com`;
  const { error: unknownError } = await client.auth.signInWithOtp({
    email: unknownEmail,
    options: { emailRedirectTo: callbackUrl, shouldCreateUser: false },
  });
  assert.ok(unknownError, "a public request cannot create a new auth user");

  const { data: usersAfterAttempt, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  assert.equal(
    usersAfterAttempt.users.some((user) => user.email === unknownEmail),
    false,
    "an unknown login address must not be persisted",
  );

  console.log("Auth integration checks passed (magic link, PKCE, allowlist, signup lock).");
} finally {
  await client.auth.signOut({ scope: "local" });
  await admin.auth.admin.deleteUser(created.user.id);
}
