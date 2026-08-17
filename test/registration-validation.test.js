import test from "node:test";
import assert from "node:assert/strict";

import { normalizeName, validateName, validatePartySize } from "../registration-validation.js";

test("normalizes surrounding and repeated whitespace", () => {
  assert.equal(normalizeName("  Marie   Dupont  "), "Marie Dupont");
});

test("accepts common French name punctuation", () => {
  assert.equal(validateName("Éléonore D'Arcy-Smith"), true);
});

test("rejects empty, oversized and unsafe names", () => {
  assert.equal(validateName("   "), false);
  assert.equal(validateName("a".repeat(51)), false);
  assert.equal(validateName("<script>"), false);
  assert.equal(validateName("Jean\u0000Dupont"), false);
  assert.equal(validateName("Jean\u200BDupont"), false);
});

test("accepts only integer party sizes from 1 to 10", () => {
  assert.equal(validatePartySize("1"), true);
  assert.equal(validatePartySize("10"), true);
  assert.equal(validatePartySize("0"), false);
  assert.equal(validatePartySize("11"), false);
  assert.equal(validatePartySize("2.5"), false);
  assert.equal(validatePartySize("not-a-number"), false);
});
