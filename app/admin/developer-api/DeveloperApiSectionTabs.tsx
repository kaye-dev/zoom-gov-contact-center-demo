"use client";

import type { DeveloperApiSettingsUpdate } from "@/lib/developer-api-settings";
import { AdminSettingsTabs } from "../AdminSettingsTabs";

export type DeveloperApiSection = DeveloperApiSettingsUpdate["section"];

export function DeveloperApiSectionTabs({ activeSection, onSelect, label, oauthLabel, webhookLabel }: {
  activeSection: DeveloperApiSection;
  onSelect: (section: DeveloperApiSection) => void;
  label: string;
  oauthLabel: string;
  webhookLabel: string;
}) {
  return (
    <AdminSettingsTabs
      activeSection={activeSection}
      onSelect={onSelect}
      label={label}
      items={[
        { key: "server-to-server-oauth", label: oauthLabel },
        { key: "webhook-only-app", label: webhookLabel },
      ]}
    />
  );
}
