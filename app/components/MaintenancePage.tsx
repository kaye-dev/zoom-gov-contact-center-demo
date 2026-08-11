"use client";

import { useI18n } from "@/app/i18n/LanguageProvider";

import { MaintenanceIllustrationIcon } from "./svg/MaintenanceIllustrationIcon";

export function MaintenancePage() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen min-h-dvh w-full items-center justify-center overflow-x-hidden bg-surface px-5 py-8 text-fg sm:px-8">
      <section
        aria-labelledby="maintenance-page-title"
        className="mx-auto flex w-full max-w-4xl flex-col items-center text-center"
      >
        <MaintenanceIllustrationIcon className="h-auto w-full max-w-[23rem]" />
        <h1
          id="maintenance-page-title"
          className="mt-7 text-2xl leading-tight font-bold sm:text-3xl"
        >
          {t.maintenance.title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 sm:text-xl">
          {t.maintenance.description}
        </p>
      </section>
    </main>
  );
}
