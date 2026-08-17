import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const endpoint = "http://127.0.0.1:55321/functions/v1/register";
const origin = "http://localhost:5173";
const functionEnvFile = !process.env.CI && existsSync("supabase/functions/register/.env.local")
  ? "supabase/functions/register/.env.local"
  : "supabase/functions/register/test.env";
function clearRateLimits() {
  const cleanup = spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_register-le-concept",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      "truncate private.registration_rate_limits",
    ],
    { encoding: "utf8" },
  );
  if (cleanup.status !== 0) {
    throw new Error(`Unable to prepare local rate limits: ${cleanup.stderr}`);
  }
}

clearRateLimits();

const supabase = spawn(
  "./node_modules/.bin/supabase",
  ["functions", "serve", "register", "--env-file", functionEnvFile],
  { stdio: ["ignore", "pipe", "pipe"] },
);

function waitUntilReady() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Edge Function startup timed out")), 30000);
    const inspect = (chunk) => {
      const output = chunk.toString();
      if (output.includes("Serving functions on")) {
        clearTimeout(timeout);
        resolve();
      }
    };

    supabase.stdout.on("data", inspect);
    supabase.stderr.on("data", inspect);
    supabase.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Edge Function exited before startup (code ${code})`));
    });
  });
}

const payload = {
  firstName: `Integration-${Date.now()}`,
  lastName: "Local",
  partySize: 2,
  turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
  website: "",
};

try {
  await waitUntilReady();

  const forbidden = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify(payload),
  });
  assert.equal(forbidden.status, 403, "an unknown origin must be rejected");

  const created = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  });
  assert.equal(created.status, 201, `expected 201, received ${await created.text()}`);

  const duplicate = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  });
  assert.equal(duplicate.status, 409, `expected 409, received ${await duplicate.text()}`);

  for (let attempt = 3; attempt <= 5; attempt += 1) {
    const accepted = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ ...payload, firstName: `${payload.firstName}-${attempt}` }),
    });
    assert.equal(accepted.status, 201, `rate attempt ${attempt} should pass`);
  }

  const rateLimited = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ ...payload, firstName: `${payload.firstName}-6` }),
  });
  assert.equal(rateLimited.status, 429, `expected 429, received ${await rateLimited.text()}`);

  console.log("Edge Function integration checks passed (403, 201, 409, 429).");
} finally {
  clearRateLimits();
  supabase.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => supabase.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (supabase.exitCode === null) supabase.kill("SIGKILL");
  supabase.stdout.destroy();
  supabase.stderr.destroy();
  supabase.unref();
}
