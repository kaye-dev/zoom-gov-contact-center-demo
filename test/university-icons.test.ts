import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { createElement, useState, type ReactNode } from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import ts from "typescript";
import { UniversityIcon, type UniversityIconName } from "../app/tenants/univ/icons/UniversityIcon";
import { universityGlyphs } from "../app/tenants/univ/icons/UniversityGlyphs";
import { universitySectionIcons, universityGuidanceIcons, universityGuidanceKeys } from "../app/tenants/univ/icons/universityIconMap";
import { consultationIllustrations } from "../app/tenants/univ/icons/ConsultationIllustrations";
import { ConsultationAvailability } from "../app/tenants/univ/ConsultationAvailability";
import { univContent } from "../app/tenants/univ/content";
import { buildDictionary } from "../app/i18n/build-dictionary";
import type { Locale } from "../app/i18n/dictionaries";

import { LanguageProvider } from "../app/i18n/LanguageProvider";
const renderToStaticMarkup = (children: ReactNode) => {
  const providerProps = { tenantKey: "univ" as const, availableLocales: ["ja"] as const, children };
  return renderMarkup(createElement(LanguageProvider, providerProps));
};

// Render the real portal while supplying only request locale and router state.
let locale: Locale = "ja";
let state = "default";
const file = path.resolve("app/tenants/univ/UniversityPortal.tsx");
const requireFromPortal = createRequire(file);
const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const portalModule = { exports: {} as { UniversityPortal: typeof import("../app/tenants/univ/UniversityPortal").UniversityPortal } };
new Function("require", "module", "exports", compiled)((name: string) => {
  if (name === "next/navigation") return { useSearchParams: () => new URLSearchParams({ state }) };
  if (name === "@/app/i18n/LanguageProvider") return { useI18n: () => ({ locale, availableLocales: Object.keys(univContent), setLocale: () => {}, t: buildDictionary("univ", locale) }) };
  return requireFromPortal(name.startsWith("@/") ? path.resolve(name.slice(2)) : name);
}, portalModule, portalModule.exports);
const Portal = portalModule.exports.UniversityPortal;
const locales = Object.keys(univContent) as Locale[];
const iconMarkup = (name: UniversityIconName, className = "h-5 w-5") => renderToStaticMarkup(createElement(UniversityIcon, { name, className }));

// Normalized SVG geometry: independent of JSX whitespace and attribute ordering.
function geometry(markup: string) {
  return [...markup.matchAll(/<(path|circle|rect|g)\b([^>]*)>/g)].map(([, tag, attrs]) => {
    const attributes = [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]).sort(([a], [b]) => a.localeCompare(b));
    return [tag, attributes];
  });
}
function shapeHash(markup: string) {
  return createHash("sha256").update(JSON.stringify(geometry(markup))).digest("hex");
}
// Frozen from the approved SVG bodies, not loaded from an unshipped plans directory.
const approvedShapeHashes: Record<string, string> = {
  "search": "d1d2a89130f566da060f64cb70a4a663abdd7b89e46d32125e486a7e51d891dc",
  "chat": "61eb2816263e9da251145e20840feba5cbf83ae14f10d947f2c05ce10193e0cf",
  "video": "ff4b9d248f33214171552023123c0b66cd39438838cb9ed4e9972f3169d06561",
  "phone": "fc9fe8716da7313245aa7bd6dbbb799530d9448fd3d3f2d37cf34be67975fb7e",
  "arrow": "f3ee95aaa5bc69b82365123a5df152ef7e1804847cf05520507e6c8132f185a9",
  "clock": "682b60e09c5698ffeb181092f50f2ba3cca619931d1b7343246440b25db9e2ce",
  "menu": "2d445888e3b6134ee5b02dd2c4116cd4645672870f49bcbde47e6b53f88ffd80",
  "close": "f707130509870c1a97581511be4e818e620971b62ca7ee51006d01030387683e",
  "chevron": "74a4d258655614dbed24b856c615d4cfa973bf918153e61478eec6fbd8d8e52d",
  "check": "ca5b94b7b80416a3f77383b64aa1710403c105277e6ba4e1ee53faa2119bd4ae",
  "warning": "fa376952197eb5a3a7fa68b26a3fa09101e3f4bc73a838224d63a72217a9e7c6",
  "school": "4a3662039be9cb47b77bf476263da7475c2b8a2bf898dc81d235adc121e4a9cb",
  "book": "f1353f6a21f3237c50cdf08e66c689c57f2a547ebe6988ba9fa66d5031ae1419",
  "people": "4272d18922df2d3b63e85f1808262119beff71ba374ca4ddd6063a7703df0d15",
  "work": "09993dd7777ff6c597f747d488ca829900ccd74b4d5d3795c312025ae221c9b6",
  "help": "f48b06f4b57ccadca6cb6112bb6115681bc162f3463e3f77d3c79ec54186dc95",
  "devices": "48f12d21e5f730479dba8df68ca60c767005e0c182aa64729ce28d340c5a0866",
  "wifi": "f2172a649db00756dc4d5a29b128b4123834a7866334e3f62a52e142565a8c47",
  "calendar": "57e98f1d99c98b186fd87ab497098eebc0d36830eab0d0a8fffedddf8ffdc035",
  "hand-heart": "166d5cd6d5ce7474e03b732e875f6c4df98ffbbbd9368e7a38d8921c77c1e8e5",
  "scholarship": "b86d5bc9bcf0700f86d56a61738b012d5c9b13e1648c77b50abc200f760a83e8"
};

test("IC-01 semantic-category-map: all locales and reordered stable keys", () => {
  assert.deepEqual(universitySectionIcons, { admissions: "school", academics: "book", "campus-life": "people", scholarships: "scholarship", careers: "work", faq: "help" });
  for (locale of locales) {
    state = "default";
    assert.deepEqual(Object.keys(univContent[locale].sections).sort(), Object.keys(universitySectionIcons).filter(key => key !== "faq").sort());
    const html = renderToStaticMarkup(createElement(Portal, { page: "home" }));
    for (const key of Object.keys(universitySectionIcons).reverse() as (keyof typeof universitySectionIcons)[]) {
      assert.ok(html.includes(iconMarkup(universitySectionIcons[key], "h-7 w-7")), `${locale}: ${key}`);
    }
  }
});

test("IC-02 guidance-and-channels: all locales and reservation", () => {
  assert.deepEqual(universityGuidanceKeys, ["devices", "network", "preparation"]);
  assert.deepEqual(universityGuidanceKeys.map(key => universityGuidanceIcons[key]), ["devices", "wifi", "calendar"]);
  for (locale of locales) {
    const copy = univContent[locale];
    assert.equal(copy.consultation.before.length, 3);
    state = "default";
    const hub = renderToStaticMarkup(createElement(Portal, { page: "consultation" }));
    assert.ok(hub.includes(iconMarkup("calendar", "h-10 w-10")));
    for (const name of ["devices", "wifi", "calendar"] as const) assert.ok(hub.includes(iconMarkup(name, "h-8 w-8")));
    for (state of ["reserve"]) {
      const html = renderToStaticMarkup(createElement(Portal, { page: "consultation" }));
      const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1]);
      assert.ok(buttons.some(body => body.endsWith(iconMarkup("chat")) && body.includes(copy.consultation.chatAction)));
      assert.ok(buttons.some(body => body.endsWith(iconMarkup("phone")) && body.includes(copy.consultation.phoneAction)));
    }
  }
});

test("IC-03 svg-contract-and-shape: every glyph and all illustration transforms", () => {
  for (const name of Object.keys(universityGlyphs) as (keyof typeof universityGlyphs)[]) {
    const body = renderToStaticMarkup(universityGlyphs[name]);
    assert.equal(shapeHash(body), approvedShapeHashes[name], name);
    if (name === "hand-heart") continue;
    const html = iconMarkup(name);
    for (const attribute of ['aria-hidden="true"', 'focusable="false"', 'viewBox="0 0 24 24"', 'fill="none"', 'stroke="currentColor"', 'stroke-linecap="round"', 'stroke-linejoin="round"']) assert.ok(html.includes(attribute), name);
    assert.ok(html.includes(`stroke-width="${name === "scholarship" ? 1.5 : 1.8}"`));
    assert.doesNotMatch(html, /<image|<filter|<foreignObject|<script|tabindex|<title/);
  }
  const expected = { admissions: ["school", 5.25], "student-support": ["hand-heart", 2], careers: ["work", 8.5] } as const;
  for (const key of Object.keys(consultationIllustrations) as (keyof typeof consultationIllustrations)[]) {
    const html = renderToStaticMarkup(createElement(consultationIllustrations[key]));
    assert.ok(html.includes('viewBox="0 0 240 160"'));
    assert.ok(html.includes(`transform="translate(42 ${expected[key][1]}) scale(6.5)"`));
    const innerStroke = Number(html.match(/<g[^>]+stroke-width="([^"]+)"/)?.[1]);
    assert.equal(innerStroke * 6.5, 4);
    assert.ok(html.includes(renderToStaticMarkup(universityGlyphs[expected[key][0]])));
  }
});

// Supply API-shaped state only inside this render test; production always fetches it.
function availabilityWithStatus(status: "ready" | "busy" | "unknown" | "unavailable") {
  const filename = path.resolve("app/tenants/univ/ConsultationAvailability.tsx");
  const localRequire = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const target = { exports: {} as { ConsultationAvailability: typeof ConsultationAvailability } };
  new Function("require", "module", "exports", code)((name: string) => {
    if (name === "react") return { ...localRequire("react"), useState: (initial: unknown) => useState(initial === null ? {
      open: true, services: ["admissions", "student-support", "careers"].map(serviceKey => ({ serviceKey, status })),
    } : initial) };
    return localRequire(name);
  }, target, target.exports);
  return target.exports.ConsultationAvailability;
}

test("IC-04 API status: ready video; busy, unknown and unavailable disabled clock", () => {
  for (const status of ["ready", "busy", "unknown", "unavailable"] as const) {
    const html = renderToStaticMarkup(createElement(availabilityWithStatus(status), {
      labels: { admissions: "Admissions", "student-support": "Support", careers: "Careers" },
      descriptions: { admissions: "A", "student-support": "S", careers: "C" },
      copy: { ready: "Ready", busy: "Busy", unavailable: "Unavailable", unknown: "Unknown", launch: "Start" },
    }));
    const cards = [...html.matchAll(/<article\b[^>]*data-availability-status="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
    assert.equal(cards.length, 3);
    for (const [, actualStatus, card] of cards) {
      assert.equal(actualStatus, status);
      const button = card.match(/<button\b([^>]*)>([\s\S]*?)<\/button>/)!;
      assert.equal(button[1].includes("disabled"), status !== "ready");
      assert.ok(button[2].includes(iconMarkup(status === "ready" ? "video" : "clock")));
      if (status === "unavailable") assert.ok(card.includes("Unavailable"));
    }
  }
});

test("IC-05 route-and-accessibility: every public page in every locale", () => {
  for (locale of locales) for (const page of ["home", "admissions", "academics", "campus-life", "scholarships", "careers", "faq", "news", "consultation"] as const) {
    state = "default";
    const html = renderToStaticMarkup(createElement(Portal, { page }));
    assert.ok(html.includes('id="main-content"'), `${locale}/${page}`);
    assert.ok(html.includes('href="/consultation"'));
    assert.doesNotMatch(html, /<svg[^>]*(?:tabindex|filter)=|<image|<foreignObject/);
  }
});

test("public query selects real consultation modes without forcing menu, FAQ or availability state", () => {
  locale = "ja";
  state = "default";
  const ordinary = renderToStaticMarkup(createElement(Portal, { page: "consultation" }));
  for (state of ["now-mixed", "now-stale", "now-closed", "now-unconfigured", "chat-triggered"]) {
    assert.equal(renderToStaticMarkup(createElement(Portal, { page: "consultation" })), ordinary);
  }
  for (const [page, query] of [["home", "mobile-nav-open"], ["faq", "faq-open"]] as const) {
    state = "default";
    const initial = renderToStaticMarkup(createElement(Portal, { page }));
    state = query;
    assert.equal(renderToStaticMarkup(createElement(Portal, { page })), initial);
  }
  state = "now-open";
  const immediate = renderToStaticMarkup(createElement(Portal, { page: "consultation" }));
  assert.equal((immediate.match(/data-availability-status="unknown"/g) ?? []).length, 3);
  assert.doesNotMatch(immediate, /data-availability-status="ready"/);
  state = "reserve";
  const reserved = renderToStaticMarkup(createElement(Portal, { page: "consultation" }));
  assert.notEqual(reserved, ordinary);
  assert.notEqual(reserved, immediate);
});

test("IC-07 adapted-source-contract: license, immutable source and no external dependencies", () => {
  const glyphs = readFileSync("app/tenants/univ/icons/UniversityGlyphs.tsx", "utf8");
  assert.ok(glyphs.includes("94e4cb9d9db5907053ebf3636a97c45529cf776b"));
  assert.ok(glyphs.includes("ISC License"));
  assert.ok(glyphs.includes("Copyright (c) 2026 Lucide"));
  assert.doesNotMatch(glyphs, /dangerouslySetInnerHTML|from ["'](?:lucide|https:)|<image|<filter/);
});
