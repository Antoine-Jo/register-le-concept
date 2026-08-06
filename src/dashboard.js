import { formatRegistrationDate, normalizeSummary } from "./admin-utils.js";
import { getVerifiedUser, navigateTo, supabase } from "./supabase-client.js";

const PAGE_SIZE = 50;
const tableBody = document.querySelector("#registration-list");
const emptyState = document.querySelector("#empty-state");
const status = document.querySelector("#dashboard-status");
const loadMoreButton = document.querySelector("#load-more");
const logoutButton = document.querySelector("#logout-button");
const registrationCount = document.querySelector("#registration-count");
const participantCount = document.querySelector("#participant-count");
const authChannel = "BroadcastChannel" in window
  ? new BroadcastChannel("le-concept-admin-auth")
  : null;

let offset = 0;
let loading = false;

function clearPrivateContent() {
  tableBody.replaceChildren();
  registrationCount.textContent = "—";
  participantCount.textContent = "—";
  emptyState.hidden = true;
  loadMoreButton.hidden = true;
}

function appendRegistration(registration) {
  const row = document.createElement("tr");
  const guestCell = document.createElement("td");
  const partyCell = document.createElement("td");
  const dateCell = document.createElement("td");

  const guestName = document.createElement("strong");
  guestName.textContent = `${registration.first_name} ${registration.last_name}`;
  guestCell.append(guestName);

  partyCell.textContent = String(registration.party_size);
  dateCell.textContent = formatRegistrationDate(registration.created_at);
  dateCell.className = "registration-date";

  row.append(guestCell, partyCell, dateCell);
  tableBody.append(row);
}

async function signOutAndRedirect() {
  clearPrivateContent();
  await supabase.auth.signOut({ scope: "global" });
  authChannel?.postMessage("signed-out");
  navigateTo("login/");
}

async function loadSummary() {
  const { data, error } = await supabase.rpc("registration_summary");
  if (error) throw error;

  const summary = normalizeSummary(data?.[0]);
  registrationCount.textContent = String(summary.registrationCount);
  participantCount.textContent = String(summary.participantCount);
}

async function loadRegistrations() {
  if (loading) return;
  loading = true;
  loadMoreButton.disabled = true;
  status.textContent = offset === 0 ? "Chargement des inscriptions…" : "Chargement…";

  try {
    const { data, error } = await supabase.rpc("list_registrations", {
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw error;

    data.forEach(appendRegistration);
    offset += data.length;
    emptyState.hidden = offset !== 0;
    loadMoreButton.hidden = data.length < PAGE_SIZE;
    status.textContent = "";
  } catch {
    status.textContent = "Les inscriptions ne peuvent pas être chargées.";
    loadMoreButton.hidden = true;
  } finally {
    loading = false;
    loadMoreButton.disabled = false;
  }
}

async function initializeDashboard() {
  clearPrivateContent();
  const user = await getVerifiedUser();
  if (!user) {
    navigateTo("login/");
    return;
  }

  try {
    await Promise.all([loadSummary(), loadRegistrations()]);
  } catch {
    await signOutAndRedirect();
  }
}

loadMoreButton.addEventListener("click", loadRegistrations);
logoutButton.addEventListener("click", signOutAndRedirect);
authChannel?.addEventListener("message", async (event) => {
  if (event.data !== "signed-out") return;
  clearPrivateContent();
  await supabase.auth.signOut({ scope: "local" });
  navigateTo("login/");
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) initializeDashboard();
});
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && !(await getVerifiedUser())) {
    clearPrivateContent();
    navigateTo("login/");
  }
});

initializeDashboard();
