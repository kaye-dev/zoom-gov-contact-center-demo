const root = document.documentElement;
const themeSwitch = document.querySelector("#theme-toggle");
const activate = document.querySelector("#activate");
const field = document.querySelector("#field");

function applyTheme(theme) {
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  themeSwitch.setAttribute("aria-checked", String(theme === "dark"));
}

const requestedTheme = new URLSearchParams(location.search).get("theme");
applyTheme(requestedTheme === "dark" ? "dark" : "light");

themeSwitch.addEventListener("click", () => {
  applyTheme(themeSwitch.getAttribute("aria-checked") === "true" ? "light" : "dark");
});

activate.addEventListener("click", () => {
  document.querySelector("#fixture-main").dataset.active = "true";
});

field.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.querySelector("#fixture-main").dataset.state = "ready";
});

root.dataset.ready = "true";
