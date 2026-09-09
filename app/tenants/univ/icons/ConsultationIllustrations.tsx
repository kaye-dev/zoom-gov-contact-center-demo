import type { UniversityConsultationService } from "@/lib/online-consultation-settings";
import { universityGlyphs } from "./UniversityGlyphs";

// Approved Lucide shapes, centered in the existing 240 x 160 region.
function ConsultationIllustration({ glyph, y }: {
  glyph: "school" | "hand-heart" | "work"; y: number;
}) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 240 160"
    fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
    strokeLinejoin="round" className="h-36 w-full">
    <g transform={`translate(42 ${y}) scale(6.5)`} strokeWidth={4 / 6.5}>
      {universityGlyphs[glyph]}
    </g>
  </svg>;
}
export function AdmissionsConsultationIllustration() {
  return <ConsultationIllustration glyph="school" y={5.25} />;
}
export function StudentSupportConsultationIllustration() {
  return <ConsultationIllustration glyph="hand-heart" y={2} />;
}
export function CareerConsultationIllustration() {
  return <ConsultationIllustration glyph="work" y={8.5} />;
}
export const consultationIllustrations = {
  admissions: AdmissionsConsultationIllustration,
  "student-support": StudentSupportConsultationIllustration,
  careers: CareerConsultationIllustration,
} as const satisfies Record<UniversityConsultationService, () => React.JSX.Element>;
