const unsafeName = /[<>\p{Cc}\p{Cf}]/u;

export function normalizeName(value) {
  return value.trim().replace(/\s+/gu, " ");
}

export function validateName(value) {
  const normalized = normalizeName(value);
  const length = Array.from(normalized).length;
  return length >= 1 && length <= 50 && !unsafeName.test(normalized);
}

export function validatePartySize(value) {
  const partySize = Number(value);
  return Number.isInteger(partySize) && partySize >= 1 && partySize <= 10;
}
