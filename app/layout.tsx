import type { Metadata } from "next";
import { connection } from "next/server";
import { getLanguageSettings } from "@/lib/server/site-settings";
import "./globals.css";
import { ThemeSync } from "./components/ThemeSync";
import { LanguageProvider } from "./i18n/LanguageProvider";

export const metadata: Metadata = {
  title: "未来市公式ウェブサイト",
  description:
    "未来市の公式ウェブサイトです。くらしの手続き、子育て・教育、防災、ごみ・リサイクル、施設案内などの行政情報をご案内します。お困りのことは AI やお電話でご相談いただけます。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const languageSettings = await getLanguageSettings();
  const availableLocales = languageSettings.locales
    .filter(({ locale, enabled }) => enabled || locale === "ja")
    .map(({ locale }) => locale);

  return (
    <html lang="ja" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <LanguageProvider availableLocales={availableLocales}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
