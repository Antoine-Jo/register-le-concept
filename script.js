const form = document.querySelector("#registration-form");
const successState = document.querySelector("#success-state");
const submitButton = form.querySelector("button[type='submit']");
const buttonLabel = submitButton.querySelector(".button-label");
const newRegistrationButton = document.querySelector("#new-registration");
const guestName = document.querySelector("#guest-name");

const fields = [
  {
    input: document.querySelector("#first-name"),
    error: document.querySelector("#first-name-error"),
    message: "Indiquez votre prénom.",
  },
  {
    input: document.querySelector("#last-name"),
    error: document.querySelector("#last-name-error"),
    message: "Indiquez votre nom.",
  },
];

function validateField(field) {
  const isValid = field.input.value.trim().length > 0;
  field.input.setAttribute("aria-invalid", String(!isValid));
  field.input.setAttribute("aria-describedby", field.error.id);
  field.error.textContent = isValid ? "" : field.message;
  return isValid;
}

fields.forEach((field) => {
  field.input.addEventListener("input", () => {
    if (field.input.getAttribute("aria-invalid") === "true") {
      validateField(field);
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const isValid = fields.map(validateField).every(Boolean);
  if (!isValid) {
    fields.find((field) => !field.input.value.trim())?.input.focus();
    return;
  }

  submitButton.disabled = true;
  buttonLabel.textContent = "Confirmation…";

  // Simulates the future Supabase request while the frontend is being validated.
  await new Promise((resolve) => window.setTimeout(resolve, 700));

  guestName.textContent = document.querySelector("#first-name").value.trim();
  form.hidden = true;
  successState.hidden = false;
  successState.focus();

  submitButton.disabled = false;
  buttonLabel.textContent = "Confirmer ma présence";
});

newRegistrationButton.addEventListener("click", () => {
  successState.hidden = true;
  form.hidden = false;
  document.querySelector("#first-name").focus();
});
