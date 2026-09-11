import type { SVGProps } from "react";

// Drawn from the user-supplied reference for the admin my-page design.
// Preserve the rounded shackle, open keyhole, lock grooves and three-row card details.
export function RoleCardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2.75" y="3.75" width="18.5" height="16.5" rx="1.25" />
      <g strokeWidth="1.2">
        <rect x="5.5" y="11.2" width="7" height="6.4" rx="0.25" />
        <path d="M6.7 11.2V9a2.3 2.3 0 0 1 4.6 0v2.2" />
        <path d="M10.9 13.3h1.6m-1.6 2.1h1.6" />
      </g>
      <circle cx="8.6" cy="13.7" r="0.95" strokeWidth="0.95" />
      <path d="M8.6 14.65v1.45" strokeWidth="1.1" />
      <path d="M14.7 9.6H18M14.7 12.3h2m1.5 0h1.6M14.7 15h4.5" strokeWidth="1.1" />
      <rect x="19.25" y="9.05" width="0.9" height="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
