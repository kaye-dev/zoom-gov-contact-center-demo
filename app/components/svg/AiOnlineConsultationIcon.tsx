import type { SVGProps } from "react";

// Adapted from the existing OnlineConsultationIcon; camera outline opens around AI.
export function AiOnlineConsultationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M11 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8" />
      <path d="m16 13.5 5-2.5v9l-5-2.5" />
      <path stroke="none" fill="currentColor" fillRule="evenodd" d="M13 8.5 15.1 2h1.8L19 8.5h-1.55l-.4-1.4h-2.1l-.4 1.4H13Zm2.32-2.7h1.36L16 3.5l-.68 2.3Z" />
      <path stroke="none" fill="currentColor" d="M20.25 2h1.5v6.5h-1.5Z" />
    </svg>
  );
}
