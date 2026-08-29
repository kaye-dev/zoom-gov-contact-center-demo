'use client';

import { useI18n } from '../i18n/LanguageProvider';
import {
  AnimatedLinkLabel,
  Breadcrumbs,
  ContentsNavigation,
  PageFrame,
  PageTitleBand,
  SectionHeading,
} from './InformationPageViews';
import { ChevronRightIcon } from './svg/ChevronRightIcon';

const registrationAddress = 'bosai-register@city.example';
const senderAddress = 'bosai-info@city.example';
const registrationSubject = 'ALL';
const demoPhone = '0120-000-000';
const contactPhoneDisplay = '(03)1234-5678';
const contactPhoneHref = 'tel:+81312345678';

export function DisasterPreventionRadioView() {
  const { t } = useI18n();
  const copy = t.contentPages.disasterRadio;
  const contentsItems = [
    { href: '#email-service', label: copy.emailHeading },
    { href: '#phone-service', label: copy.phoneHeading },
    { href: '#radio-contact', label: copy.contactHeading },
  ] as const;

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: t.contentPages.home, href: '/' },
          { label: t.contentPages.lifeIndexTitle, href: '/life' },
          {
            label: t.findInfo.lifeInfo.items.safety,
            href: '/life/emergency-safety-disaster',
          },
          { label: copy.breadcrumb },
        ]}
      />

      <PageTitleBand
        title={copy.title}
        iconSrc="/life-information/life-safety.png"
      />
      <p className="mt-6 max-w-6xl text-base leading-8 text-fg-muted">
        {copy.lead}
      </p>

      <ContentsNavigation items={contentsItems} />

      <div className="mt-12 flex max-w-6xl flex-col gap-12">
        <section
          id="email-service"
          aria-labelledby="email-heading"
          className="scroll-mt-24"
        >
          <SectionHeading id="email-heading">{copy.emailHeading}</SectionHeading>
          <div className="mt-8 px-5 md:px-6">
            <p className="leading-8 text-fg">{copy.emailDescription}</p>

            <h3 className="mt-8 text-lg font-bold text-fg md:text-xl">
              {copy.registrationHeading}
            </h3>
            <ol className="mt-5 list-decimal space-y-3 pl-6 leading-8 text-fg">
              {copy.registrationSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <a
              href={`mailto:${registrationAddress}?subject=${registrationSubject}`}
              className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ChevronRightIcon className="shrink-0" />
              <AnimatedLinkLabel>{copy.registrationLink}</AnimatedLinkLabel>
            </a>

            <dl className="mt-8 border-x border-b border-line">
              <div className="grid border-t border-line md:grid-cols-[14rem_1fr]">
                <dt className="bg-surface-hover px-5 py-4 font-bold leading-7 text-fg md:px-6">
                  {copy.registrationAddressLabel}
                </dt>
                <dd className="break-all px-5 py-4 leading-8 text-fg md:px-6">
                  <code>{registrationAddress}</code>
                </dd>
              </div>
              <div className="grid border-t border-line md:grid-cols-[14rem_1fr]">
                <dt className="bg-surface-hover px-5 py-4 font-bold leading-7 text-fg md:px-6">
                  {copy.senderAddressLabel}
                </dt>
                <dd className="break-all px-5 py-4 leading-8 text-fg md:px-6">
                  <code>{senderAddress}</code>
                </dd>
              </div>
            </dl>
            <p className="mt-5 leading-8 text-fg-muted">{copy.emailNote}</p>
          </div>
        </section>

        <section
          id="phone-service"
          aria-labelledby="phone-heading"
          className="scroll-mt-24"
        >
          <SectionHeading id="phone-heading">{copy.phoneHeading}</SectionHeading>
          <div className="mt-8 px-5 md:px-6">
            <p className="leading-8 text-fg">{copy.phoneDescription}</p>
            <dl className="mt-6 border border-line">
              <div className="grid md:grid-cols-[14rem_1fr]">
                <dt className="bg-surface-hover px-5 py-4 font-bold text-fg md:px-6">
                  {copy.phoneNumberLabel}
                </dt>
                <dd className="px-5 py-4 font-semibold leading-8 text-fg md:px-6">
                  {demoPhone}
                  {copy.demoSuffix}
                </dd>
              </div>
            </dl>
            <p className="mt-5 leading-8 text-fg-muted">{copy.phoneNote}</p>
          </div>
        </section>

        <section
          id="radio-contact"
          aria-labelledby="radio-contact-heading"
          className="scroll-mt-24 border border-line"
        >
          <h2
            id="radio-contact-heading"
            className="bg-surface-hover px-5 py-4 text-xl font-bold leading-8 text-fg md:px-6 md:text-2xl"
          >
            {copy.contactHeading}
          </h2>
          <div className="px-5 py-6 md:px-6">
            <p className="leading-8 text-fg">{copy.contactNote}</p>
            <dl className="mt-5 border border-line">
              <div className="grid md:grid-cols-[12rem_1fr]">
                <dt className="bg-surface-hover px-4 py-3 font-bold text-fg">
                  {copy.contactPhoneLabel}
                </dt>
                <dd className="px-4 py-3">
                  <a
                    href={contactPhoneHref}
                    className="font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <AnimatedLinkLabel>{contactPhoneDisplay}</AnimatedLinkLabel>
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
