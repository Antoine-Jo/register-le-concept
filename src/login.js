import { appUrl, getVerifiedUser, navigateTo, supabase } from "./supabase-client.js";

const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#admin-email");
const submitButton = form.querySelector("button[type='submit']");
const status = document.querySelector("#login-status");

async function redirectExistingSession() {
  if (await getVerifiedUser()) navigateTo("dashboard/");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.className = "admin-status";

  if (!emailInput.validity.valid) {
    status.textContent = "Indiquez une adresse e-mail valide.";
    emailInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Envoi en cours…";

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: emailInput.value.trim(),
      options: {
        emailRedirectTo: appUrl("auth/callback/"),
        shouldCreateUser: false,
      },
    });

    if (error?.status === 429) {
      status.textContent =
        "Trop de liens ont été demandés. Attendez une minute avant de réessayer.";
      return;
    }

    form.reset();
    status.className = "admin-status is-success";
    status.textContent =
      "Demande prise en compte. Seules les adresses autorisées reçoivent un lien de connexion valable 10 minutes.";
  } catch {
    status.textContent = "Le service de connexion est momentanément inaccessible. Réessayez plus tard.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Recevoir le lien sécurisé";
  }
});

redirectExistingSession();
