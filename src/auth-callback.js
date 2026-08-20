import { appUrl, navigateTo, supabase } from "./supabase-client.js";

const status = document.querySelector("#callback-status");
const parameters = new URLSearchParams(window.location.search);
const code = parameters.get("code");
const tokenHash = parameters.get("token_hash");

window.history.replaceState({}, document.title, appUrl("auth/callback/"));

async function completeSignIn() {
  if (!code && !tokenHash) {
    status.textContent = "Ce lien de connexion est incomplet ou a déjà été utilisé.";
    return;
  }

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
    : await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    status.textContent = "Ce lien de connexion est invalide ou a expiré.";
    return;
  }

  navigateTo("dashboard/");
}

completeSignIn();
