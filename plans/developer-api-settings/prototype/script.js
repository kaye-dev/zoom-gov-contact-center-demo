const requestedTheme = new URLSearchParams(window.location.search).get("theme");
if (requestedTheme === "dark" || requestedTheme === "light") {
  document.documentElement.classList.toggle("dark", requestedTheme === "dark");
  document.documentElement.classList.toggle("light", requestedTheme === "light");
}

const menuTriggers = [...document.querySelectorAll("[data-admin-menu-trigger]")];

function closeMenus(exceptTrigger = null) {
  for (const trigger of menuTriggers) {
    if (trigger === exceptTrigger) continue;
    const menuId = trigger.getAttribute("aria-controls");
    const menu = menuId ? document.getElementById(menuId) : null;
    trigger.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
  }
}

for (const trigger of menuTriggers) {
  const menuId = trigger.getAttribute("aria-controls");
  const menu = menuId ? document.getElementById(menuId) : null;
  if (!menu) continue;

  trigger.addEventListener("click", () => {
    const willOpen = trigger.getAttribute("aria-expanded") !== "true";
    closeMenus(willOpen ? trigger : null);
    trigger.setAttribute("aria-expanded", String(willOpen));
    menu.hidden = !willOpen;
  });

  trigger.parentElement?.addEventListener("focusout", (event) => {
    if (!trigger.parentElement?.contains(event.relatedTarget)) closeMenus();
  });
}

document.addEventListener("mousedown", (event) => {
  if (!menuTriggers.some((trigger) => trigger.parentElement?.contains(event.target))) {
    closeMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const openTrigger = menuTriggers.find(
    (trigger) => trigger.getAttribute("aria-expanded") === "true",
  );
  closeMenus();
  openTrigger?.focus();
});

const prototypeStoredSecrets = new Map([
  ["client-secret", "StoredClientSecret#Prototype"],
  ["secret-token", "StoredSecretToken#Prototype"],
]);

for (const toggle of document.querySelectorAll("[data-password-toggle]")) {
  const inputId = toggle.getAttribute("aria-controls");
  const input = inputId ? document.getElementById(inputId) : null;
  if (!(input instanceof HTMLInputElement)) continue;

  toggle.addEventListener("click", () => {
    const willShow = input.type !== "text";
    if (
      willShow &&
      input.value === "" &&
      input.dataset.configured === "true"
    ) {
      input.value = prototypeStoredSecrets.get(input.id) ?? "";
      input.dataset.secretOrigin = "stored";
      input.dataset.revealState = "stored-visible";
    } else if (!willShow && input.dataset.secretOrigin === "stored") {
      input.value = "";
      delete input.dataset.secretOrigin;
      input.dataset.revealState = "masked";
    }
    setPasswordVisibility(toggle, input, willShow);
  });

  input.addEventListener("input", () => {
    if (input.dataset.secretOrigin === "stored") {
      input.dataset.secretOrigin = "replacement";
      input.dataset.revealState = "replacement-visible";
    }
  });
}

function setPasswordVisibility(toggle, input, isVisible) {
  const showIcon = toggle.querySelector("[data-show-icon]");
  const hideIcon = toggle.querySelector("[data-hide-icon]");
  if (!showIcon || !hideIcon) return;
  input.type = isVisible ? "text" : "password";
  toggle.setAttribute("aria-pressed", String(isVisible));
  toggle.setAttribute(
    "aria-label",
    isVisible ? "パスワードを非表示" : "パスワードを表示",
  );
  showIcon.toggleAttribute("hidden", isVisible);
  hideIcon.toggleAttribute("hidden", !isVisible);
}

for (const { formId, feedbackId, secretInputId } of [
  {
    formId: "server-to-server-oauth-form",
    feedbackId: "server-to-server-oauth-feedback",
    secretInputId: "client-secret",
  },
  {
    formId: "webhook-only-app-form",
    feedbackId: "webhook-only-app-feedback",
    secretInputId: "secret-token",
  },
]) {
  const form = document.getElementById(formId);
  const feedback = document.getElementById(feedbackId);
  const input = document.getElementById(secretInputId);
  const toggle = document.querySelector(`[data-password-toggle][aria-controls='${secretInputId}']`);
  if (!form || !feedback || !(input instanceof HTMLInputElement) || !toggle) continue;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    input.value = "";
    input.dataset.configured = "true";
    delete input.dataset.secretOrigin;
    input.dataset.revealState = "masked";
    input.placeholder = "••••••••••••";
    setPasswordVisibility(toggle, input, false);
    feedback.hidden = false;
  });
}
