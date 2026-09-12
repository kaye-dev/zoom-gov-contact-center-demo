"use client";
import type { ReactNode } from "react";
export type DemoEntryCopy = { brand: string; title: string; description: string; footer: string; open: string };
export function DemoFrame({ copy, children }: { copy: DemoEntryCopy; children: ReactNode }) {
  return <div className="min-h-screen flex flex-col bg-surface text-fg border-t-4 border-accent"><header className="border-b border-line"><div className="mx-auto max-w-6xl px-5 py-6 flex items-center justify-center"><span className="font-bold text-lg">{copy.brand}</span></div></header>{children}<footer className="mt-auto border-t border-line"><p className="mx-auto max-w-6xl px-5 py-6 text-center text-sm text-fg-muted">{copy.footer}</p></footer></div>;
}
export function DemoEntry({ copy, sites }: { copy: DemoEntryCopy; sites: { key: string; title: string; name: string; description: string; href: string }[] }) {
 return <DemoFrame copy={copy}><main className="mx-auto w-full max-w-6xl px-5 py-12 md:py-20"><h1 className="text-3xl md:text-4xl font-bold">{copy.title}</h1><p className="mt-4 text-fg-muted leading-7">{copy.description}</p><div className="mt-10 grid gap-6 md:grid-cols-2">{sites.map(site => <a key={site.key} href={site.href} className="group flex flex-col border border-line p-6 md:p-8 hover:border-accent hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"><h2 className="text-2xl font-bold">{site.title}</h2><p className="mt-3 font-bold">{site.name}</p><p className="mt-3 leading-7 text-fg-muted">{site.description}</p><span className="mt-8 flex items-center justify-between font-bold text-accent">{copy.open}<span aria-hidden="true">→</span></span></a>)}</div></main></DemoFrame>;
}
