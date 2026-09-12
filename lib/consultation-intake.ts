export type ConsultationIntake = {
  displayName: string;
  affiliation: string;
  topic: string;
};

export const INTAKE_LIMITS = { displayName: 40, affiliation: 40, topic: 300 } as const;

/** Validate before the browser shares intake data with Zoom. */
export function normalizeConsultationIntake(input: ConsultationIntake): ConsultationIntake | null {
  const values = {
    displayName: input.displayName.trim(),
    affiliation: input.affiliation.trim(),
    topic: input.topic.trim(),
  };
  return (Object.keys(INTAKE_LIMITS) as (keyof ConsultationIntake)[]).every(
    key => values[key].length > 0 && values[key].length <= INTAKE_LIMITS[key],
  ) ? values : null;
}
