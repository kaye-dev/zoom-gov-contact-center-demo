"use client";

import type { ReactNode } from "react";
import { flushSync } from "react-dom";

export function AdminSettingsTabs<Key extends string>({ activeSection, onSelect, label, items }: {
  activeSection: Key;
  onSelect: (section: Key) => void;
  label: string;
  items: readonly { key: Key; label: string }[];
}) {
  return (
    <div id="admin-section-navigation" className="-mx-4 overflow-x-auto border-b border-line px-4 md:-mx-6 md:px-6">
      <div role="tablist" aria-label={label} className="flex min-w-max gap-8">
        {items.map((item, index) => (
          <button
            key={item.key}
            id={`${item.key}-tab`}
            type="button"
            role="tab"
            aria-selected={activeSection === item.key}
            aria-controls={`${item.key}-panel`}
            tabIndex={activeSection === item.key ? 0 : -1}
            onClick={() => onSelect(item.key)}
            onKeyDown={(event) => {
              let next: number;
              switch (event.key) {
                case "ArrowRight": next = (index + 1) % items.length; break;
                case "ArrowLeft": next = (index + items.length - 1) % items.length; break;
                case "Home": next = 0; break;
                case "End": next = items.length - 1; break;
                default: return;
              }
              event.preventDefault();
              onSelect(items[next].key);
              document.getElementById(`${items[next].key}-tab`)?.focus();
            }}
            className={`cursor-pointer whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${activeSection === item.key ? "border-accent font-bold text-accent" : "border-transparent font-semibold text-fg-muted hover:text-fg"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminSettingsPanel({ section, activeSection, children }: {
  section: string;
  activeSection: string;
  children: ReactNode;
}) {
  return (
    <div id={`${section}-panel`} data-settings-section={section} role="tabpanel" aria-labelledby={`${section}-tab`} tabIndex={0} hidden={activeSection !== section}>
      {children}
    </div>
  );
}

// Keep native constraints across all tabs, revealing the first invalid field
// before the browser tries to focus it. The form must use noValidate.
export function validateSettingsTabs(form: HTMLFormElement, revealSection: (section: string) => void) {
  const invalid = Array.from(form.elements).find((element) =>
    "willValidate" in element && element.willValidate &&
    "validity" in element && !(element.validity as ValidityState).valid,
  ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
  if (!invalid) return true;
  const section = invalid.closest<HTMLElement>("[data-settings-section]")?.dataset.settingsSection;
  if (section) flushSync(() => revealSection(section));
  invalid.focus();
  invalid.reportValidity();
  return false;
}
