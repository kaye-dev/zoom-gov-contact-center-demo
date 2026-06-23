import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeSync } from "./components/ThemeSync";
import { LanguageProvider } from "./i18n/LanguageProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "未来市公式ウェブサイト",
  description:
    "未来市の公式ウェブサイトです。くらしの手続き、子育て・教育、防災、ごみ・リサイクル、施設案内などの行政情報をご案内します。お困りのことは AI やお電話でご相談いただけます。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
