import type { SVGProps } from "react";

// Drawn from the sidebar toggle reference supplied by the user.
export function SidebarToggleIcon({ collapsed = false, ...props }: SVGProps<SVGSVGElement> & { collapsed?: boolean }) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="1" />
      <path d={collapsed ? "M15 2.75v18.5" : "M9 2.75v18.5"} />
    </svg>
  );
}
