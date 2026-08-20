import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const htmlFiles = [
  "dist/index.html",
  "dist/login/index.html",
  "dist/dashboard/index.html",
  "dist/auth/callback/index.html",
  "dist/mentions-legales/index.html",
  "dist/donnees-personnelles/index.html",
];

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  assert.doesNotMatch(html, /%VITE_/, `${file} contains an unresolved environment placeholder`);
  assert.doesNotMatch(html, /service[_-]?role/i, `${file} contains a privileged key marker`);
}

const publicPages = [
  "dist/index.html",
  "dist/mentions-legales/index.html",
  "dist/donnees-personnelles/index.html",
];
for (const file of publicPages) {
  const html = readFileSync(file, "utf8");
  assert.match(html, /mentions-legales\//, `${file} must link to the legal notice`);
  assert.match(html, /donnees-personnelles\//, `${file} must link to the privacy notice`);
}

const bundleFiles = readdirSync("dist", { recursive: true })
  .filter((file) => /\.(?:html|js)$/u.test(file))
  .map((file) => `dist/${file}`);
for (const file of bundleFiles) {
  const content = readFileSync(file, "utf8");
  assert.doesNotMatch(
    content,
    /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|["']service_role["']/,
    `${file} contains a privileged Supabase credential marker`,
  );
}

const dashboardSource = readFileSync("src/dashboard.js", "utf8");
assert.doesNotMatch(
  dashboardSource,
  /innerHTML|insertAdjacentHTML|document\.write/,
  "dashboard rendering must not use HTML string injection",
);

console.log("Multi-page build artifact checks passed.");
