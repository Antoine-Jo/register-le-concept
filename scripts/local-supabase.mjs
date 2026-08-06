import { spawnSync } from "node:child_process";

export function getLocalSupabaseEnvironment() {
  const status = spawnSync(
    "./node_modules/.bin/supabase",
    ["status", "-o", "env"],
    { encoding: "utf8" },
  );
  if (status.status !== 0) {
    throw new Error("Local Supabase must be running");
  }

  return Object.fromEntries(
    status.stdout
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

export function allowlistLocalDashboardUser(userId) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid local user id");

  const result = spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_register-le-concept",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `insert into private.dashboard_users (user_id) values ('${userId}') on conflict (user_id) do nothing`,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("Unable to update the local dashboard allowlist");
}
