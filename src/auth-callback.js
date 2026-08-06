import { appUrl, navigateTo, supabase } from "./supabase-client.js";

const status = document.querySelector("#callback-status");
const code = new URLSearchParams(window.location.search).get("code");

window.history.replaceState({}, document.title, appUrl("auth/callback/"));

async function completeSignIn() {
  if (!code) {
    status.textContent = "Ce lien de connexion est incomplet ou a déjà été utilisé.";
    return;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    status.textContent = "Ce lien de connexion est invalide ou a expiré.";
    return;
  }

  navigateTo("dashboard/");
}

completeSignIn();
