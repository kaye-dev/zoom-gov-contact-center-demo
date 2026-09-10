import type { Locale } from "@/app/i18n/dictionaries";
import type { TenantKey } from "@/lib/tenants";

export type PrototypeConfig = {
  route?: string;
  tenant?: TenantKey;
  locale?: Locale;
  theme?: "light" | "dark";
  assets?: string[];
};
