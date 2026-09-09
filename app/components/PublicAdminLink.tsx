"use client";
import { useSyncExternalStore, type ComponentProps } from "react";
import { publicAdminHref } from "@/lib/admin-routing";
import type { TenantKey } from "@/lib/tenants";

const subscribe = () => () => {};
export function PublicAdminLink({ tenant, ...props }: Omit<ComponentProps<"a">, "href"> & { tenant: TenantKey }) {
  const hostname = useSyncExternalStore(subscribe, () => window.location.hostname, () => "");
  return <a {...props} href={publicAdminHref(tenant, hostname)} />;
}
