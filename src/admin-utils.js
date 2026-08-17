export function formatRegistrationDate(value, locale = "fr-FR") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function normalizeSummary(value) {
  const registrationCount = Number(value?.registration_count);
  const participantCount = Number(value?.participant_count);
  return {
    registrationCount: Number.isSafeInteger(registrationCount) ? registrationCount : 0,
    participantCount: Number.isSafeInteger(participantCount) ? participantCount : 0,
  };
}
