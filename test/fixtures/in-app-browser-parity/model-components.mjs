/** Same source is imported by both representative host and consumer. */
export function mountSharedControls(root, { label, onConfirm }) {
  const dialog = root.querySelector("#shared-dialog");
  const trigger = root.querySelector("#dialog-open");
  const help = root.querySelector("#help");
  const tooltip = root.querySelector("#help-text");
  root.querySelector("#dialog-copy").textContent = `Confirm the change for ${label}.`;
  trigger.addEventListener("click", () => dialog.showModal());
  root.querySelector("#dialog-cancel").addEventListener("click", () => dialog.close());
  root.querySelector("#dialog-confirm").addEventListener("click", () => { onConfirm(); dialog.close(); });
  dialog.addEventListener("close", () => trigger.focus());
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const first = root.querySelector("#dialog-cancel");
    const last = root.querySelector("#dialog-confirm");
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  help.addEventListener("pointerenter", () => { tooltip.hidden = false; });
  help.addEventListener("pointerleave", () => { tooltip.hidden = true; });
  help.addEventListener("focus", () => { tooltip.hidden = false; });
  help.addEventListener("blur", () => { tooltip.hidden = true; });
  help.addEventListener("click", () => { tooltip.hidden = false; });
  help.addEventListener("keydown", (event) => { if (event.key === "Escape") tooltip.hidden = true; });
}
