import type { SVGProps } from "react";

// Source: https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/person/materialsymbolsoutlined/person_24px.svg
// Adapted from Google Material Symbols person (Apache-2.0). Redrawn head/body contours for the sidebar optical grid.
export function PersonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="6" r="3" />
      <path d="M3 21v-3c0-1.2.65-2.2 1.7-2.75C6.85 14.1 9.4 13.5 12 13.5s5.15.6 7.3 1.75C20.35 15.8 21 16.8 21 18v3H3Z" />
    </svg>
  );
}
