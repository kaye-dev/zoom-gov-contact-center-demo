import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Checkbox,
  type CheckboxProps,
} from "../app/components/Checkbox";

type ForbiddenCheckboxProps = Extract<
  keyof CheckboxProps,
  "children" | "className" | "size" | "style" | "type"
>;

const checkboxForbidsGeometryOverrides: [ForbiddenCheckboxProps] extends [never]
  ? true
  : false = true;

const checkboxPath = fileURLToPath(
  new URL("../app/components/Checkbox.tsx", import.meta.url),
);
const checkboxSource = readFileSync(checkboxPath, "utf8");
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

function hasSquareSize(classes: Set<string>, size: number): boolean {
  return (
    classes.has(`size-${size}`) ||
    (classes.has(`h-${size}`) && classes.has(`w-${size}`))
  );
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

test("Checkbox keeps native input semantics and owns indeterminate synchronization", () => {
  const markup = renderToStaticMarkup(
    createElement(Checkbox, {
      "aria-label": "権限を表示",
      defaultChecked: true,
      disabled: true,
      indeterminate: true,
    }),
  );
  const rootTag = tagWithAttribute(markup, "data-checkbox-root");
  const targetTag = tagWithAttribute(markup, "data-checkbox-target");

  assert.match(rootTag, /\bdata-checkbox-root=""/);
  assert.match(targetTag, /\btype="checkbox"/);
  assert.match(targetTag, /\baria-label="権限を表示"/);
  assert.match(targetTag, /\bchecked=""/);
  assert.match(targetTag, /\bdisabled=""/);
  assert.doesNotMatch(targetTag, /\bindeterminate=/);

  assert.match(checkboxSource, /useLayoutEffect/);
  assert.match(checkboxSource, /\.indeterminate\s*=\s*indeterminate/);
  assert.match(checkboxSource, /useImperativeHandle/);
  assert.match(
    checkboxSource,
    /event\.currentTarget\.indeterminate\s*=\s*indeterminate/,
  );
  assert.match(checkboxSource, /onChange\?\.\(event\)/);
  assert.equal(checkboxForbidsGeometryOverrides, true);
});

test("Checkbox separates a 24px target from the 16px Zoom-style indicator", () => {
  const markup = renderToStaticMarkup(
    createElement(Checkbox, { "aria-label": "権限を表示" }),
  );
  const rootClasses = classesForTag(
    tagWithAttribute(markup, "data-checkbox-root"),
  );
  const targetClasses = classesForTag(
    tagWithAttribute(markup, "data-checkbox-target"),
  );
  const indicatorClasses = classesForTag(
    tagWithAttribute(markup, "data-checkbox-indicator"),
  );

  assert.ok(hasSquareSize(rootClasses, 6), "操作領域は24px四方にします");
  assert.ok(
    hasSquareSize(targetClasses, 6) ||
      (targetClasses.has("inset-0") &&
        targetClasses.has("h-full") &&
        targetClasses.has("w-full")),
    "native inputは24pxの操作領域全体を覆います",
  );
  assert.ok(hasSquareSize(indicatorClasses, 4), "可視部は16px四方にします");
  assert.ok(indicatorClasses.has("rounded-[4px]"), "角丸は4pxにします");
  assert.ok(
    indicatorClasses.has("border") || indicatorClasses.has("border-[1px]"),
    "可視部の罫線は1pxにします",
  );
});

test("Checkbox centralizes semantic, focus, disabled, and forced-color states", () => {
  const markup = renderToStaticMarkup(
    createElement(Checkbox, { "aria-label": "権限を表示" }),
  );
  const targetClasses = classesForTag(
    tagWithAttribute(markup, "data-checkbox-target"),
  );
  const indicatorClasses = classesForTag(
    tagWithAttribute(markup, "data-checkbox-indicator"),
  );

  for (const className of [
    "border-fg-muted",
    "bg-surface",
    "peer-checked:border-accent",
    "peer-checked:bg-accent",
    "peer-checked:text-surface",
    "peer-indeterminate:border-accent",
    "peer-indeterminate:bg-accent",
    "peer-indeterminate:text-surface",
    "peer-focus-visible:outline-2",
    "peer-focus-visible:outline-offset-2",
    "peer-focus-visible:outline-accent",
  ]) {
    assert.ok(
      indicatorClasses.has(className),
      `indicatorに${className}が必要です`,
    );
  }

  assert.ok(
    [...indicatorClasses].some((className) =>
      className.startsWith("peer-disabled:opacity-"),
    ),
    "disabled状態を可視化します",
  );
  assert.ok(targetClasses.has("disabled:cursor-not-allowed"));
  assert.ok(targetClasses.has("forced-colors:appearance-auto"));
  assert.ok(targetClasses.has("forced-colors:opacity-100"));
  assert.ok(indicatorClasses.has("forced-colors:hidden"));
});

test("application screens use the shared Checkbox instead of raw checkbox inputs", () => {
  const rawCheckboxPattern =
    /<input\b(?=[^>]*\btype\s*=\s*(?:["']checkbox["']|\{\s*["']checkbox["']\s*\}))[^>]*>/;

  assert.equal(rawCheckboxPattern.test('<input type={"checkbox"} />'), true);

  const violations = readAppComponentSources(appRoot).flatMap(
    ({ path, source }) => {
      if (join(appRoot, path) === checkboxPath) return [];
      return rawCheckboxPattern.test(source) ? [path] : [];
    },
  );

  assert.deepEqual(violations, []);
  assert.equal(
    checkboxSource.match(
      /<input\b(?=[^>]*\btype\s*=\s*["']checkbox["'])[^>]*>/g,
    )?.length,
    1,
  );
});
