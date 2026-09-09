import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: { default: "管理画面", template: "%s | 管理画面" }, icons: { icon: { url: "/favicons/admin.svg", type: "image/svg+xml", sizes: "any" } }, robots: { index: false, follow: false } };
export default function AdminAuthLayout({ children }: { children: ReactNode }) { return children; }
