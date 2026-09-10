"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AdminShellView, type AdminShellViewProps } from "./AdminShellView";

export { useAdminNavigationContext } from "./AdminShellView";
export type { AdminNavigationItemKey } from "./admin-navigation";

type AdminShellProps = Omit<AdminShellViewProps, "onSignOut">;

export function AdminShell(props: AdminShellProps) {
  const router = useRouter();
  const signOut = async () => {
    await authClient.signOut();
    window.location.replace("/admin/login");
    router.refresh();
  };
  return <AdminShellView {...props} onSignOut={signOut} />;
}
