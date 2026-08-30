const params = new URLSearchParams(window.location.search);
const requestedTheme = params.get("theme");
if (requestedTheme === "dark" || requestedTheme === "light") {
  document.documentElement.classList.toggle("dark", requestedTheme === "dark");
  document.documentElement.classList.toggle("light", requestedTheme === "light");
}

const menuTriggers = [...document.querySelectorAll("[data-admin-menu-trigger]")];
function closeMenus(except = null) {
  for (const trigger of menuTriggers) {
    if (trigger === except) continue;
    trigger.setAttribute("aria-expanded", "false");
    const menu = document.getElementById(trigger.getAttribute("aria-controls"));
    if (menu) menu.hidden = true;
  }
}
for (const trigger of menuTriggers) {
  const menu = document.getElementById(trigger.getAttribute("aria-controls"));
  trigger.addEventListener("click", () => {
    const opening = trigger.getAttribute("aria-expanded") !== "true";
    closeMenus(opening ? trigger : null);
    trigger.setAttribute("aria-expanded", String(opening));
    if (menu) menu.hidden = !opening;
  });
}
document.addEventListener("mousedown", (event) => {
  if (!menuTriggers.some((trigger) => trigger.parentElement.contains(event.target))) closeMenus();
});

const calendarPreview = document.getElementById("calendar-preview");
if (calendarPreview) {
  const leading = 2;
  const states = ["空きあり", "残りわずか", "空きあり", "満員", "空きあり"];
  for (let index = 0; index < 35; index += 1) {
    const day = index - leading + 1;
    const cell = document.createElement(day > 0 && day <= 30 ? "button" : "span");
    if (day <= 0 || day > 30) {
      cell.className = "min-h-24 bg-surface-raised sm:min-h-28";
      cell.setAttribute("aria-hidden", "true");
    } else {
      const sunday = index % 7 === 0;
      const state = sunday ? "受付なし" : states[day % states.length];
      cell.type = "button";
      cell.disabled = sunday;
      cell.className = day === 8
        ? "min-h-24 cursor-pointer bg-surface-selected p-2 text-left ring-2 ring-inset ring-accent sm:min-h-28"
        : sunday
          ? "min-h-24 cursor-not-allowed bg-surface p-2 text-left text-fg-muted sm:min-h-28"
          : "min-h-24 cursor-pointer bg-surface-raised p-2 text-left hover:bg-surface-hover sm:min-h-28";
      const statusClass = state === "満員" ? "text-red-700 dark:text-red-300" : state === "残りわずか" ? "text-amber-700 dark:text-amber-300" : state === "受付なし" ? "text-fg-muted" : "text-green-700 dark:text-green-300";
      cell.innerHTML = `<span class="block text-sm font-semibold">${day}</span><span class="mt-2 block text-xs font-semibold ${statusClass}">${state}</span><span class="mt-1 block text-xs text-fg-muted">${sunday ? "" : day % 5 === 0 ? "20/20件" : "10/20件"}</span>`;
    }
    calendarPreview.append(cell);
  }
}

const page = document.getElementById("reservation-api-keys-page");
if (page) {
  const state = params.get("state") ?? "representative";
  const issueDialog = document.getElementById("issue-dialog");
  const issuedDialog = document.getElementById("issued-dialog");
  const revokeDialog = document.getElementById("revoke-dialog");
  const usageLimitDialog = document.getElementById("usage-limit-dialog");
  const keyUsageLimitDialog = document.getElementById("key-usage-limit-dialog");
  const dialogs = [usageLimitDialog, keyUsageLimitDialog, issueDialog, issuedDialog, revokeDialog];
  let returnFocus = null;

  function focusable(dialog) {
    return [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
  }
  function openDialog(dialog, trigger) {
    closeDialog();
    returnFocus = trigger ?? document.activeElement;
    dialog.hidden = false;
    page.inert = true;
    page.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";
    const first = dialog === issuedDialog
      ? document.getElementById("copy-api-key")
      : dialog === revokeDialog
        ? document.getElementById("cancel-revoke")
        : dialog === usageLimitDialog
          ? document.getElementById("usage-limit-input")
          : dialog === keyUsageLimitDialog
            ? document.getElementById("key-usage-limit-input")
        : focusable(dialog)[0] ?? dialog.querySelector("[role='dialog']");
    window.requestAnimationFrame(() => first?.focus());
  }
  function closeDialog(restore = false) {
    const wasOpen = dialogs.some((dialog) => dialog && !dialog.hidden);
    for (const dialog of dialogs) if (dialog) dialog.hidden = true;
    page.inert = false;
    page.removeAttribute("aria-hidden");
    document.body.style.overflow = "";
    if (restore && wasOpen) returnFocus?.focus();
  }

  const usageLimitInput = document.getElementById("usage-limit-input");
  const usageLimitError = document.getElementById("usage-limit-error");
  const limitedMode = document.getElementById("usage-mode-limited");
  const unlimitedMode = document.getElementById("usage-mode-unlimited");
  const keyUsageLimitInput = document.getElementById("key-usage-limit-input");
  const keyUsageLimitError = document.getElementById("key-usage-limit-error");
  const keyLimitedMode = document.getElementById("key-usage-mode-limited");
  const keyUnlimitedMode = document.getElementById("key-usage-mode-unlimited");
  const issueKeyLimitInput = document.getElementById("issue-key-limit-input");
  const issueKeyLimitError = document.getElementById("issue-key-limit-error");
  const issueKeyLimitedMode = document.getElementById("issue-key-mode-limited");
  const issueKeyUnlimitedMode = document.getElementById("issue-key-mode-unlimited");
  function parseMonthlyLimit(input) {
    const rawValue = input.value.trim();
    let valid = /^\d+$/.test(rawValue);
    let value = 0n;
    if (valid) {
      value = BigInt(rawValue);
      valid = value >= 100n && value <= 9223372036854775800n && (value <= 10000n || value % 100n === 0n);
    }
    return { valid, value };
  }
  function syncUsageLimitMode() {
    usageLimitInput.disabled = unlimitedMode.checked;
    usageLimitError.hidden = true;
  }
  function syncKeyUsageLimitMode() {
    keyUsageLimitInput.disabled = keyUnlimitedMode.checked;
    keyUsageLimitError.hidden = true;
  }
  function syncIssueKeyLimitMode() {
    issueKeyLimitInput.disabled = issueKeyUnlimitedMode.checked;
    issueKeyLimitError.hidden = true;
  }
  function setUnlimitedSummary() {
    document.getElementById("usage-limit-value").textContent = "上限なし";
    document.getElementById("usage-remaining-value").textContent = "—";
  }
  limitedMode.addEventListener("change", syncUsageLimitMode);
  unlimitedMode.addEventListener("change", syncUsageLimitMode);
  keyLimitedMode.addEventListener("change", syncKeyUsageLimitMode);
  keyUnlimitedMode.addEventListener("change", syncKeyUsageLimitMode);
  issueKeyLimitedMode.addEventListener("change", syncIssueKeyLimitMode);
  issueKeyUnlimitedMode.addEventListener("change", syncIssueKeyLimitMode);
  document.getElementById("open-usage-limit-dialog").addEventListener("click", (event) => openDialog(usageLimitDialog, event.currentTarget));
  document.getElementById("open-key-usage-limit-dialog").addEventListener("click", (event) => openDialog(keyUsageLimitDialog, event.currentTarget));
  document.getElementById("open-issue-dialog").addEventListener("click", (event) => openDialog(issueDialog, event.currentTarget));
  document.getElementById("open-revoke-dialog").addEventListener("click", (event) => openDialog(revokeDialog, event.currentTarget));
  document.getElementById("cancel-usage-limit").addEventListener("click", () => closeDialog(true));
  document.getElementById("cancel-key-usage-limit").addEventListener("click", () => closeDialog(true));
  document.getElementById("cancel-issue").addEventListener("click", () => closeDialog(true));
  document.getElementById("cancel-revoke").addEventListener("click", () => closeDialog(true));
  document.getElementById("close-issued").addEventListener("click", () => closeDialog(true));
  document.getElementById("confirm-revoke").addEventListener("click", () => {
    document.querySelector("[data-key-row='active']").setAttribute("data-revoked", "true");
    closeDialog(true);
  });
  document.getElementById("usage-limit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (unlimitedMode.checked) {
      setUnlimitedSummary();
      closeDialog(true);
      return;
    }
    const { valid, value } = parseMonthlyLimit(usageLimitInput);
    usageLimitError.hidden = valid;
    if (!valid) {
      usageLimitInput.focus();
      return;
    }
    const formatted = new Intl.NumberFormat("ja-JP").format(value);
    document.getElementById("usage-limit-value").textContent = `${formatted}件`;
    const remaining = value > 2480n ? value - 2480n : 0n;
    document.getElementById("usage-remaining-value").textContent = `${new Intl.NumberFormat("ja-JP").format(remaining)}件`;
    closeDialog(true);
  });
  document.getElementById("key-usage-limit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (keyUnlimitedMode.checked) {
      document.getElementById("active-key-limit").innerHTML = '<span class="font-semibold">上限なし</span>';
      document.getElementById("active-key-usage").innerHTML = '<span class="font-semibold">780件</span><span class="mt-1 block text-xs text-fg-muted">残り 上限なし</span>';
      closeDialog(true);
      return;
    }
    const { valid, value } = parseMonthlyLimit(keyUsageLimitInput);
    keyUsageLimitError.hidden = valid;
    if (!valid) {
      keyUsageLimitInput.focus();
      return;
    }
    const formatted = new Intl.NumberFormat("ja-JP").format(value);
    const remaining = value > 780n ? value - 780n : 0n;
    document.getElementById("active-key-limit").innerHTML = `<span class="font-semibold">${formatted}件</span>`;
    document.getElementById("active-key-usage").innerHTML = `<span class="font-semibold">780件</span><span class="mt-1 block text-xs text-fg-muted">残り ${new Intl.NumberFormat("ja-JP").format(remaining)}件</span>`;
    closeDialog(true);
  });
  document.getElementById("issue-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const checked = document.querySelectorAll("input[name='permissions']:checked");
    const error = document.getElementById("permission-error");
    error.hidden = checked.length > 0;
    const limit = parseMonthlyLimit(issueKeyLimitInput);
    const validLimit = issueKeyUnlimitedMode.checked || limit.valid;
    issueKeyLimitError.hidden = validLimit;
    if (checked.length === 0 || !validLimit) {
      if (!validLimit) issueKeyLimitInput.focus();
      return;
    }
    openDialog(issuedDialog, document.getElementById("open-issue-dialog"));
  });
  document.getElementById("copy-api-key").addEventListener("click", async () => {
    const input = document.getElementById("issued-api-key");
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); }
    document.getElementById("copy-feedback").hidden = false;
  });
  document.addEventListener("keydown", (event) => {
    const open = dialogs.find((dialog) => dialog && !dialog.hidden);
    if (!open) {
      if (event.key === "Escape") closeMenus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog(true);
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable(open);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  if (state === "view-only") {
    document.getElementById("read-only-notice").hidden = false;
    document.getElementById("open-issue-dialog").disabled = true;
    document.getElementById("open-revoke-dialog").disabled = true;
    document.getElementById("open-usage-limit-dialog").disabled = true;
    document.getElementById("open-key-usage-limit-dialog").disabled = true;
  } else if (state === "empty") {
    document.getElementById("api-key-table-wrap").hidden = true;
    document.getElementById("api-key-empty").hidden = false;
  } else if (state === "issue-dialog") {
    openDialog(issueDialog, document.getElementById("open-issue-dialog"));
  } else if (state === "issued-secret") {
    openDialog(issuedDialog, document.getElementById("open-issue-dialog"));
  } else if (state === "revoke-dialog") {
    openDialog(revokeDialog, document.getElementById("open-revoke-dialog"));
  } else if (state === "usage-limit-dialog") {
    openDialog(usageLimitDialog, document.getElementById("open-usage-limit-dialog"));
  } else if (state === "key-usage-limit-dialog") {
    openDialog(keyUsageLimitDialog, document.getElementById("open-key-usage-limit-dialog"));
  } else if (state === "unlimited") {
    unlimitedMode.checked = true;
    syncUsageLimitMode();
    setUnlimitedSummary();
  }
}
