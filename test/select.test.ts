import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Select, type SelectProps } from "../app/components/Select";

type ForbiddenSelectProps = Extract<
  keyof SelectProps,
  "className" | "multiple" | "size" | "style"
>;

const selectForbidsGeometryOverrides: [ForbiddenSelectProps] extends [never]
  ? true
  : false = true;

const nativeSelectProps: SelectProps = {
  "aria-describedby": "role-help",
  "aria-labelledby": "role-label",
  autoFocus: true,
  defaultValue: "admin",
  disabled: true,
  name: "role",
  onChange: () => undefined,
  ref: createRef<HTMLSelectElement>(),
  required: true,
};

const selectPath = fileURLToPath(
  new URL("../app/components/Select.tsx", import.meta.url),
);
const selectSource = readFileSync(selectPath, "utf8");
const designSource = readFileSync(
  new URL("../DESIGN.md", import.meta.url),
  "utf8",
);
const appRoot = fileURLToPath(new URL("../app/", import.meta.url));

function tagWithAttribute(markup: string, attribute: string): string {
  const tag = markup.match(new RegExp(`<[^>]+\\b${attribute}=""[^>]*>`))?.[0];
  assert.ok(tag, `${attribute} を持つ要素が必要です`);
  return tag;
}

function classesForTag(tag: string): Set<string> {
  const className = tag.match(/\bclass="([^"]*)"/)?.[1];
  assert.ok(className, `class属性が必要です: ${tag}`);
  return new Set(className.split(/\s+/).filter(Boolean));
}

function readAppComponentSources(
  directory: string,
): { path: string; source: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) return readAppComponentSources(entryPath);
    if (
      !entry.isFile() ||
      (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".jsx"))
    ) {
      return [];
    }

    return [
      {
        path: relative(appRoot, entryPath),
        source: readFileSync(entryPath, "utf8"),
      },
    ];
  });
}

function renderSelect() {
  return renderToStaticMarkup(
    createElement(
      Select,
      nativeSelectProps,
      createElement("option", { value: "user" }, "一般ユーザー"),
      createElement("option", { value: "admin" }, "管理者"),
    ),
  );
}

test("shared Select preserves native single-select props and ref contract", () => {
  const markup = renderSelect();
  const targetTag = tagWithAttribute(markup, "data-select-target");

  assert.match(targetTag, /\bname="role"/);
  assert.match(targetTag, /\baria-labelledby="role-label"/);
  assert.match(targetTag, /\baria-describedby="role-help"/);
  assert.match(targetTag, /\brequired=""/);
  assert.match(targetTag, /\bdisabled=""/);
  assert.match(targetTag, /\bautofocus=""/);
  assert.match(markup, /<option value="admin" selected="">管理者<\/option>/);
  assert.match(selectSource, /ComponentPropsWithRef<"select">/);
  assert.match(selectSource, /\.\.\.selectProps/);
  assert.equal(selectForbidsGeometryOverrides, true);
});

test("shared Select owns reference-aligned chrome", () => {
  const markup = renderSelect();
  const rootClasses = classesForTag(
    tagWithAttribute(markup, "data-select-root"),
  );
  const targetClasses = classesForTag(
    tagWithAttribute(markup, "data-select-target"),
  );
  const iconClasses = classesForTag(
    tagWithAttribute(markup, "data-select-icon"),
  );

  for (const className of ["relative", "block", "w-full"]) {
    assert.ok(rootClasses.has(className), `rootに${className}が必要です`);
  }
  for (const className of [
    "block",
    "w-full",
    "cursor-pointer",
    "appearance-none",
    "rounded-md",
    "border",
    "border-line",
    "bg-surface",
    "px-3",
    "py-2",
    "pr-10",
    "text-fg",
  ]) {
    assert.ok(targetClasses.has(className), `selectに${className}が必要です`);
  }
  for (const className of [
    "pointer-events-none",
    "absolute",
    "inset-y-0",
    "right-3",
    "text-fg-muted",
  ]) {
    assert.ok(iconClasses.has(className), `iconに${className}が必要です`);
  }
  assert.match(markup, /<svg[^>]*height="20px"[^>]*width="20px"/);
});

test("shared Select centralizes focus disabled and forced-colors states", () => {
  const markup = renderSelect();
  const targetClasses = classesForTag(
    tagWithAttribute(markup, "data-select-target"),
  );
  const iconClasses = classesForTag(
    tagWithAttribute(markup, "data-select-icon"),
  );

  for (const className of [
    "focus:border-accent",
    "focus-visible:outline-2",
    "focus-visible:outline-offset-2",
    "focus-visible:outline-accent",
    "disabled:cursor-not-allowed",
    "disabled:opacity-60",
    "forced-colors:appearance-auto",
  ]) {
    assert.ok(targetClasses.has(className), `selectに${className}が必要です`);
  }
  assert.ok(iconClasses.has("peer-disabled:opacity-60"));
  assert.ok(iconClasses.has("forced-colors:hidden"));
});

test("all application selects use the shared Select", () => {
  const rawSelectPattern = /<select\b/;
  const applicationSources = readAppComponentSources(appRoot);
  const violations = applicationSources.flatMap(({ path, source }) => {
    if (join(appRoot, path) === selectPath) return [];
    return rawSelectPattern.test(source) ? [path] : [];
  });
  const sharedUsageCount = applicationSources.reduce(
    (count, entry) =>
      count + (entry.path === "components/Select.tsx" ? 0 : (entry.source.match(/<Select\b/g)?.length ?? 0)),
    0,
  );

  assert.deepEqual(violations, []);
  assert.equal(selectSource.match(/<select\b/g)?.length, 1);
  assert.equal(sharedUsageCount, 12);
  assert.match(designSource, /#### 6\.5\.2 セレクト/);
  assert.match(designSource, /app\/components\/Select\.tsx/);
});
