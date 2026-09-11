import type { SVGProps } from "react";

// Adapted from the existing ChatIcon. Top/right outline is actually open around AI letter outlines; no background mask.
export function AiChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M11 3H5a2 2 0 0 0-2 2v16l5-3h11a2 2 0 0 0 2-2v-5" />
      <path d="M7 8h4M7 13h8" />
      <path stroke="none" fill="currentColor" fillRule="evenodd" d="M13 8.5 15.1 2h1.8L19 8.5h-1.55l-.4-1.4h-2.1l-.4 1.4H13Zm2.32-2.7h1.36L16 3.5l-.68 2.3Z" />
      <path stroke="none" fill="currentColor" d="M20.25 2h1.5v6.5h-1.5Z" />
    </svg>
  );
}
