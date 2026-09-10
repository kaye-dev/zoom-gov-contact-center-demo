"use client";

import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/admin-fetch";
import { RolesPanel, type RolesActions, type RolesData } from "./RolesPanel";

export function RolesView(props: RolesData) {
  const router = useRouter();
  const actions: RolesActions = {
    async createRole({ name, description }) {
      const response = await adminFetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const body = (await response.json().catch(() => null)) as
        | { role?: { id: string }; error?: string }
        | null;
      return { ok: response.ok, role: body?.role, error: body?.error };
    },
    async deleteRole(id, expectedRevision) {
      const response = await adminFetch(`/api/admin/roles/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision }),
      });
      return { ok: response.ok, status: response.status };
    },
    onCreated(id) {
      router.push(`/admin/roles/${encodeURIComponent(id)}`);
      router.refresh();
    },
    onDeleted(href) {
      if (href) router.push(href);
      router.refresh();
    },
  };
  return <RolesPanel {...props} actions={actions} />;
}
