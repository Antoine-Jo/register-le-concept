import test from "node:test";
import assert from "node:assert/strict";

import { formatRegistrationDate, normalizeSummary } from "../src/admin-utils.js";

test("normalizes database summary values", () => {
  assert.deepEqual(normalizeSummary({ registration_count: 4, participant_count: "9" }), {
    registrationCount: 4,
    participantCount: 9,
  });
});

test("falls back to zero for malformed summary values", () => {
  assert.deepEqual(normalizeSummary({ registration_count: "invalid" }), {
    registrationCount: 0,
    participantCount: 0,
  });
});

test("formats valid dates and rejects invalid ones", () => {
  assert.match(formatRegistrationDate("2026-09-25T18:30:00Z", "fr-FR"), /2026/);
  assert.equal(formatRegistrationDate("not-a-date"), "Date inconnue");
});
