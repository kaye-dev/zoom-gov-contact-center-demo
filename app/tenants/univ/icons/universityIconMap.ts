import type { UniversitySectionKey } from "../content";
import type { UniversityIconName } from "./UniversityIcon";

export const universitySectionIcons = {
  admissions: "school", academics: "book", "campus-life": "people",
  scholarships: "scholarship", careers: "work", faq: "help",
} as const satisfies Record<UniversitySectionKey | "faq", UniversityIconName>;

export const universityGuidanceKeys = ["devices", "network", "preparation"] as const satisfies readonly ["devices", "network", "preparation"];
export const universityGuidanceIcons = {
  devices: "devices", network: "wifi", preparation: "calendar",
} as const satisfies Record<typeof universityGuidanceKeys[number], UniversityIconName>;
