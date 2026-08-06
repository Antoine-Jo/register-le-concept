import { normalizeName, validateName, validatePartySize } from "./registration-validation.js";

const form = document.querySelector("#registration-form");
const successState = document.querySelector("#success-state");
const submitButton = form.querySelector("button[type='submit']");
const buttonLabel = submitButton.querySelector(".button-label");
const guestName = document.querySelector("#guest-name");
const formStatus = document.querySelector("#form-status");
const turnstileError = document.querySelector("#turnstile-error");
const endpoint = import.meta.env.VITE_REGISTRATION_ENDPOINT;
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let turnstileToken = "";
let turnstileWidgetId;
let turnstileReady = false;

const fields = [
  {
    input: document.querySelector("#first-name"),
    error: document.querySelector("#first-name-error"),
    message: "Indiquez un prénom valide (50 caractères maximum).",
    validate: validateName,
  },
  {
    input: document.querySelector("#last-name"),
    error: document.querySelector("#last-name-error"),
    message: "Indiquez un nom valide (50 caractères maximum).",
    validate: validateName,
  },
  {
    input: document.querySelector("#party-size"),
    error: document.querySelector("#party-size-error"),
    message: "Choisissez un nombre de personnes entre 1 et 10.",
    validate: validatePartySize,
  },
];

function validateField(field) {
  const isValid = field.validate(field.input.value);
  field.input.setAttribute("aria-invalid", String(!isValid));
  field.error.textContent = isValid ? "" : field.message;
  return isValid;
}

function setFormStatus(message) {
  formStatus.textContent = message;
}

function resetTurnstile() {
  turnstileToken = "";
  if (turnstileReady && turnstileWidgetId !== undefined) {
    window.turnstile.reset(turnstileWidgetId);
  }
}

function loadTurnstile() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(window.turnstile), { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load")), {
      once: true,
    });
    document.head.append(script);
  });
}

async function initializeTurnstile() {
  if (!endpoint || !turnstileSiteKey) {
    setFormStatus("Le formulaire est temporairement indisponible.");
    return;
  }

  try {
    const turnstile = await loadTurnstile();
    turnstileWidgetId = turnstile.render("#turnstile-widget", {
      sitekey: turnstileSiteKey,
      action: "register",
      theme: "dark",
      callback(token) {
        turnstileToken = token;
        turnstileError.textContent = "";
      },
      "expired-callback"() {
        turnstileToken = "";
        turnstileError.textContent = "La vérification a expiré. Recommencez-la.";
      },
      "error-callback"() {
        turnstileToken = "";
        turnstileError.textContent = "La vérification a échoué. Réessayez.";
      },
    });
    turnstileReady = true;
    submitButton.disabled = false;
  } catch {
    setFormStatus("La vérification de sécurité n’a pas pu être chargée. Réessayez plus tard.");
  }
}

fields.forEach((field) => {
  field.input.addEventListener("input", () => {
    if (field.input.getAttribute("aria-invalid") === "true") validateField(field);
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormStatus("");

  const isValid = fields.map(validateField).every(Boolean);
  if (!isValid) {
    fields.find((field) => !field.validate(field.input.value))?.input.focus();
    return;
  }

  if (!turnstileToken) {
    turnstileError.textContent = "Effectuez la vérification de sécurité.";
    return;
  }

  submitButton.disabled = true;
  buttonLabel.textContent = "Confirmation…";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: normalizeName(document.querySelector("#first-name").value),
        lastName: normalizeName(document.querySelector("#last-name").value),
        partySize: Number(document.querySelector("#party-size").value),
        turnstileToken,
        website: document.querySelector("#website").value,
      }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 201) {
      guestName.textContent = normalizeName(document.querySelector("#first-name").value);
      form.hidden = true;
      successState.hidden = false;
      successState.focus();
      return;
    }

    resetTurnstile();
    if (response.status === 409) {
      setFormStatus(
        "Une inscription avec ce prénom et ce nom existe déjà. Contactez l’organisateur s’il s’agit d’un homonyme.",
      );
    } else if (response.status === 429) {
      setFormStatus("Trop de tentatives ont été effectuées. Réessayez dans quelques minutes.");
    } else if (response.status === 400) {
      setFormStatus("La vérification ou les informations sont invalides. Recommencez.");
    } else {
      setFormStatus("L’inscription n’a pas pu être enregistrée. Réessayez plus tard.");
    }
  } catch {
    resetTurnstile();
    setFormStatus("Le service est momentanément inaccessible. Vérifiez votre connexion et réessayez.");
  } finally {
    submitButton.disabled = !turnstileReady;
    buttonLabel.textContent = "Confirmer ma présence";
  }
});

initializeTurnstile();
