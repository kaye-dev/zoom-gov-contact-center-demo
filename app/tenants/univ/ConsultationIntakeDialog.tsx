"use client";

import { useRef, useState } from "react";
import { ModalDialog } from "@/app/components/admin/ModalDialog";
import { Feedback } from "@/app/components/admin/Feedback";
import { Select } from "@/app/components/Select";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { INTAKE_LIMITS, normalizeConsultationIntake, type ConsultationIntake } from "@/lib/consultation-intake";

const fieldClass = "mt-2 block w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none focus:border-accent focus:shadow-[inset_0_0_0_1px_var(--color-accent)]";

export function ConsultationIntakeDialog({ category, initialValues, launchError, onClose, onSubmit }: {
  category: string;
  initialValues: ConsultationIntake;
  launchError: boolean;
  onClose: () => void;
  onSubmit: (values: ConsultationIntake) => void;
}) {
  const { t } = useI18n();
  const copy = t.videoConsultation.intake;
  const [values, setValues] = useState(initialValues);
  const [invalid, setInvalid] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const change = (key: keyof ConsultationIntake, value: string) => {
    setValues(previous => ({ ...previous, [key]: value }));
    setInvalid(false);
  };
  return (
    <ModalDialog title={copy.title} description={copy.description} onRequestClose={onClose} initialFocusRef={nameRef}>
      <p className="mt-5 border-l-4 border-primary pl-3 font-bold text-primary">{category}</p>
      <form className="mt-5 space-y-5" onSubmit={event => {
        event.preventDefault();
        const normalized = normalizeConsultationIntake(values);
        if (!normalized) { setInvalid(true); nameRef.current?.focus(); return; }
        onSubmit(normalized);
      }}>
        {launchError && <Feedback tone="error">{t.videoConsultation.failed}</Feedback>}
        {invalid && <Feedback tone="error" id="intake-error">{copy.invalid}</Feedback>}
        <div>
          <label htmlFor="intake-name" className="text-sm font-bold">{copy.displayName}</label>
          <input ref={nameRef} id="intake-name" name="displayName" required maxLength={INTAKE_LIMITS.displayName} value={values.displayName} onChange={event => change("displayName", event.target.value)} aria-describedby="intake-name-help" aria-invalid={invalid && !values.displayName.trim()} className={fieldClass} />
          <p id="intake-name-help" className="mt-2 text-sm text-fg-muted">{copy.nameHelp}</p>
        </div>
        <div>
          <label htmlFor="intake-affiliation" className="text-sm font-bold">{copy.affiliation}</label>
          <Select id="intake-affiliation" name="affiliation" required value={values.affiliation} onChange={event => change("affiliation", event.target.value)} containerClassName="mt-2">
            <option value="" disabled>{copy.select}</option>
            {copy.affiliations.map(label => <option key={label} value={label}>{label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="intake-topic" className="text-sm font-bold">{copy.topic}</label>
          <textarea id="intake-topic" name="topic" required rows={3} maxLength={INTAKE_LIMITS.topic} value={values.topic} onChange={event => change("topic", event.target.value)} aria-describedby="intake-topic-help" aria-invalid={invalid && !values.topic.trim()} className={fieldClass} />
          <p id="intake-topic-help" className="mt-2 text-sm text-fg-muted">{copy.topicHelp} <span>{values.topic.length}/{INTAKE_LIMITS.topic}</span></p>
        </div>
        <p className="text-sm leading-6 text-fg-muted">{copy.sharing}</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 cursor-pointer rounded-md border border-line px-4 py-2 font-bold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">{copy.cancel}</button>
          <button type="submit" className="min-h-11 cursor-pointer rounded-md bg-primary px-5 py-2 font-bold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{copy.submit}</button>
        </div>
      </form>
    </ModalDialog>
  );
}
