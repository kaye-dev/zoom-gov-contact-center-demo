const query = new URLSearchParams(location.search);
document.documentElement.className = query.get("theme") === "dark" ? "dark" : "light";
const main = document.querySelector("main");
let site = "lg";
async function readSettings() {
  const response = await fetch(`/api/fidelity-settings?site=${site}`);
  if (!response.ok) throw new Error("Fixture read failed");
  const data = await response.json();
  document.querySelector("#site").textContent = site;
  document.querySelector("#value").value = data.value;
  document.querySelector("#saved").textContent = data.value;
}
for (const next of ["lg", "univ"]) document.querySelector(`#site-${next}`).addEventListener("click", async () => { site = next; await readSettings(); });
document.querySelector("#save").addEventListener("click", async () => {
  const response = await fetch(`/api/fidelity-settings?site=${site}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: document.querySelector("#value").value }) });
  if (!response.ok) throw new Error("Fixture save failed");
  await readSettings();
});
async function initialize() {
  document.querySelector("#heading").textContent = (await (await fetch("/fidelity-copy.txt")).text()).trim();
  await readSettings();
  main.dataset.state = query.get("state") === "error" ? "error" : "ready";
  document.querySelector("#state-error").hidden = main.dataset.state !== "error";
}
initialize();
