import { universityGlyphs } from "./UniversityGlyphs";

export type UniversityIconName = Exclude<keyof typeof universityGlyphs, "hand-heart">;

export function UniversityIcon({ name, className = "h-5 w-5" }: {
  name: UniversityIconName;
  className?: string;
}) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={name === "scholarship" ? 1.5 : 1.8}
    strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    {universityGlyphs[name]}
  </svg>;
}
