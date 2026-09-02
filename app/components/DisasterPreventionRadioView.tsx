'use client';

import { useRef, useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/LanguageProvider';
import { Checkbox } from './Checkbox';
import {
  Breadcrumbs,
  ContentsNavigation,
  PageFrame,
  PageTitleBand,
  SectionHeading,
} from './InformationPageViews';

const demoPhone = '0120-000-000';
const contactPhoneDisplay = '(03)1234-5678';
const contactPhoneHref = 'tel:+81312345678';

type PublicRegistrationState = 'ready' | 'pending' | 'success' | 'empty' | 'failure';

export function DisasterPreventionRadioView({ initialReviewState }: { initialReviewState?: string }) {
  const { t } = useI18n();
  const copy = t.contentPages.disasterRadio;
  const formCopy = copy.form;
  const reviewState = isPublicRegistrationState(initialReviewState) ? initialReviewState : null;
  const [state, setState] = useState<PublicRegistrationState>(reviewState ?? 'ready');
  const validationErrorRef = useRef<HTMLDivElement>(null);
  const serverErrorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const contentsItems = [
    { href: '#registration-service', label: formCopy.heading },
    { href: '#phone-service', label: copy.phoneHeading },
    { href: '#radio-contact', label: copy.contactHeading },
  ] as const;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === 'pending') return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const phone = String(formData.get('phone') ?? '').trim();
    const consent = formData.get('consent') === 'on';
    if (!name || !email || !phone || !consent || !form.checkValidity()) {
      setState('empty');
      requestAnimationFrame(() => validationErrorRef.current?.focus());
      return;
    }
    setState('pending');
    try {
      const response = await fetch('/api/disaster-radio-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, email, phone, consent: true }),
      });
      const body = await response.json() as { status?: string };
      if (!response.ok || body.status !== 'accepted') throw new Error('registration unavailable');
      setState('success');
      form.reset();
      requestAnimationFrame(() => successRef.current?.focus());
    } catch {
      setState('failure');
      requestAnimationFrame(() => serverErrorRef.current?.focus());
    }
  };

  return (
    <div id="disaster-radio-registration-page" className="mx-auto w-full max-w-7xl">
      <PageFrame>
        <Breadcrumbs
          items={[
            { label: t.contentPages.home, href: '/' },
            { label: copy.lifeBreadcrumb, href: '/life' },
            { label: copy.safetyBreadcrumb, href: '/life/emergency-safety-disaster' },
            { label: copy.breadcrumb },
          ]}
        />
        <PageTitleBand title={copy.title} iconSrc="/life-information/life-safety.png" />
        <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">{copy.lead}</p>
        <ContentsNavigation items={contentsItems} heading={copy.contentsHeading} />

        <div className="mt-12 flex max-w-6xl flex-col gap-12">
        <section id="registration-service" aria-labelledby="registration-heading" className="scroll-mt-24">
          <SectionHeading id="registration-heading" tabIndex={-1}>{formCopy.heading}</SectionHeading>
          <div className="mt-8 px-5 md:px-6">
            <p className="leading-8 text-fg">{formCopy.description}</p>
            <div id="disaster-registration-card" className="mt-6 border border-line bg-surface-raised px-5 py-6 md:px-6 md:py-8">
              <div data-public-state="" data-visible-states="ready,pending,empty,failure" hidden={state === 'success'}>
                <div
                  ref={validationErrorRef}
                  id="registration-error-summary"
                  tabIndex={-1}
                  role="alert"
                  data-visible-states="empty"
                  hidden={state !== 'empty'}
                  className="mb-6 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm leading-7 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                  <p className="font-bold">{formCopy.validationTitle}</p>
                  <ul className="mt-1 list-disc pl-5"><li>{formCopy.validationMessage}</li></ul>
                </div>
                <div
                  ref={serverErrorRef}
                  id="registration-server-error"
                  tabIndex={-1}
                  role="alert"
                  data-visible-states="failure"
                  hidden={state !== 'failure'}
                  className="mb-6 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm leading-7 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                  <p className="font-bold">{formCopy.serverErrorTitle}</p>
                  <p>{formCopy.serverErrorMessage}</p>
                </div>
                  <form
                    ref={formRef}
                    id="disaster-registration-form"
                    noValidate
                    aria-busy={state === 'pending'}
                    className="space-y-6"
                    onSubmit={submit}
                  >
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label htmlFor="resident-name" className="block text-sm font-bold text-fg">{formCopy.name} <RequiredLabel>{formCopy.required}</RequiredLabel></label>
                        <input id="resident-name" name="name" autoComplete="name" maxLength={100} required defaultValue="" disabled={state === 'pending'} className={inputClass} />
                        <p data-visible-states="empty" className="mt-2 text-sm text-red-700 dark:text-red-300" hidden={state !== 'empty'}>{formCopy.nameValidationMessage}</p>
                      </div>
                      <div>
                        <label htmlFor="resident-email" className="block text-sm font-bold text-fg">{formCopy.email} <RequiredLabel>{formCopy.required}</RequiredLabel></label>
                        <input id="resident-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={state === 'pending'} placeholder="example@example.jp" className={inputClass} />
                        <p className="mt-2 text-sm leading-6 text-fg-muted">{formCopy.emailHelp}</p>
                      </div>
                      <div>
                        <label htmlFor="resident-phone" className="block text-sm font-bold text-fg">{formCopy.phone} <RequiredLabel>{formCopy.required}</RequiredLabel></label>
                        <input id="resident-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} required disabled={state === 'pending'} placeholder="090-1234-5678" className={inputClass} />
                        <p className="mt-2 text-sm leading-6 text-fg-muted">{formCopy.phoneHelp}</p>
                      </div>
                    </div>
                    <label className="flex items-start gap-3 rounded-md bg-surface-hover px-4 py-4">
                      <Checkbox id="resident-consent" name="consent" required disabled={state === 'pending'} variant="plain" />
                      <span className="text-sm leading-7 text-fg">{formCopy.consent} <span className="font-bold text-red-700 dark:text-red-300">{formCopy.required}</span></span>
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <button id="zaad-registration-submit" type="submit" disabled={state === 'pending'} aria-busy={state === 'pending' || undefined} className="min-h-11 cursor-pointer rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60">
                        <span id="registration-submit-label">{state === 'pending' ? formCopy.submitting : formCopy.submit}</span>
                      </button>
                      <p aria-live="polite" className="text-sm leading-6 text-fg-muted">{formCopy.syncNote}</p>
                    </div>
                </form>
              </div>
              <section data-public-state="" data-visible-states="success" hidden={state !== 'success'} aria-labelledby="registration-success-heading" className="py-2">
                <div className="border-l-4 border-green-700 bg-green-50 px-5 py-5 text-green-900 dark:bg-green-950/40 dark:text-green-100">
                  <h3 ref={successRef} id="registration-success-heading" tabIndex={-1} className="text-lg font-bold">{formCopy.successTitle}</h3>
                  <p className="mt-2 leading-7">{formCopy.successMessage}</p>
                </div>
                <button type="button" id="register-another" onClick={() => setState('ready')} className="mt-5 min-h-11 cursor-pointer rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  {formCopy.registerAnother}
                </button>
              </section>
            </div>
            <p className="mt-5 leading-8 text-fg-muted">{formCopy.assignmentNote}</p>
          </div>
        </section>

        <section id="phone-service" aria-labelledby="phone-heading" className="scroll-mt-24">
          <SectionHeading id="phone-heading">{copy.phoneHeading}</SectionHeading>
          <div className="mt-8 px-5 md:px-6">
            <p className="leading-8 text-fg">{copy.phoneDescription}</p>
            <dl className="mt-6 border border-line"><div className="grid md:grid-cols-[14rem_1fr]"><dt className="bg-surface-hover px-5 py-4 font-bold text-fg md:px-6">{copy.phoneNumberLabel}</dt><dd className="px-5 py-4 font-semibold leading-8 text-fg md:px-6">{demoPhone}{copy.demoSuffix}</dd></div></dl>
            <p className="mt-5 leading-8 text-fg-muted">{copy.phoneNote}</p>
          </div>
        </section>

        <section id="radio-contact" aria-labelledby="radio-contact-heading" className="scroll-mt-24 border border-line">
          <h2 id="radio-contact-heading" className="bg-surface-hover px-5 py-4 text-xl font-bold leading-8 text-fg md:px-6 md:text-2xl">{copy.contactHeading}</h2>
          <div className="px-5 py-6 md:px-6"><p className="leading-8 text-fg">{copy.contactNote}</p><dl className="mt-5 border border-line"><div className="grid md:grid-cols-[12rem_1fr]"><dt className="bg-surface-hover px-4 py-3 font-bold text-fg">{copy.contactPhoneLabel}</dt><dd className="px-4 py-3"><a href={contactPhoneHref} className="font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{contactPhoneDisplay}</a></dd></div></dl></div>
        </section>
        </div>
      </PageFrame>
    </div>
  );
}

const inputClass = 'mt-2 min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60';

function RequiredLabel({ children }: { children: string }) {
  return <span className="text-red-700 dark:text-red-300">{children}</span>;
}

function isPublicRegistrationState(value: string | undefined): value is PublicRegistrationState {
  return value === 'ready' || value === 'pending' || value === 'success' || value === 'empty' || value === 'failure';
}
