"use client";

import { useSearchParams } from "next/navigation";
import { AdminShellView } from "@/app/admin/AdminShellView";
import { EditableGroupPanel } from "./EditableGroupPanel";
import { EditableGroupPanel as TransferredPanel } from "./implementation/EditableGroupPanel";
import { connectedSave, copy, fixture, mockSave, visibleItems } from "./fixtures";

export default function Entry() {
  const transferred = useSearchParams().get("adapter") === "implementation";
  const Panel = transferred ? TransferredPanel : EditableGroupPanel;
  return (
    <AdminShellView visibleItems={visibleItems} currentUserName={fixture.currentUserName} outreach={{ allowedTenants: ["lg"], hostTenant: "lg" }} onSignOut={async () => {}}>
      <Panel name={fixture.name} copy={copy} onSave={transferred ? connectedSave : mockSave} />
    </AdminShellView>
  );
}
