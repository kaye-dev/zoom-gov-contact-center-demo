import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Pagination } from "../app/components/admin/Pagination";
import { SearchInput } from "../app/components/admin/SearchInput";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("shared SearchInput owns accessible Flowbite-style field presentation only", () => {
  const component = source("../app/components/admin/SearchInput.tsx");
  const html = renderToStaticMarkup(
    createElement(SearchInput, {
      id: "member-search",
      label: "Search members",
      value: "city",
      readOnly: true,
    }),
  );

  assert.match(component, /useId\(\)/u);
  assert.match(component, /data-search-input/u);
  assert.match(component, /<label htmlFor=\{inputId\} className="sr-only">/u);
  assert.match(component, /<SearchIcon/u);
  assert.match(component, /pointer-events-none absolute left-3/u);
  assert.match(component, /type="search"/u);
  assert.match(component, /border border-line/u);
  assert.match(component, /focus:border-accent/u);
  assert.match(component, /focus:outline-none/u);
  assert.match(component, /focus:ring-0/u);
  assert.doesNotMatch(component, /focus-visible:(?:outline|ring|shadow)/u);
  assert.doesNotMatch(component, /shadow/u);
  assert.doesNotMatch(component, /useRouter|router\.|setTimeout|<form|<button/u);
  assert.match(html, /data-search-input="true"/u);
  assert.match(
    html,
    /<label for="member-search" class="sr-only">Search members<\/label>/u,
  );
  assert.match(html, /type="search"/u);
  assert.match(html, /value="city"/u);
});

test("shared SearchInput uses a local decorative Material Symbols search icon", () => {
  const icon = source("../app/components/svg/SearchIcon.tsx");

  assert.match(icon, /viewBox="0 -960 960 960"/u);
  assert.match(icon, /fill="currentColor"/u);
  assert.match(icon, /aria-hidden="true"/u);
  assert.match(icon, /focusable="false"/u);
  assert.match(icon, /M784-120 532-372/u);
  assert.doesNotMatch(icon, /https?:\/\//u);
});

test("shared Pagination renders localized first, middle, and last page states", () => {
  const render = (page: number) =>
    renderToStaticMarkup(
      Pagination({
        page,
        totalPages: 3,
        previousHref: `/admin/users?page=${page - 1}&search=city`,
        nextHref: `/admin/users?page=${page + 1}&search=city`,
        ariaLabel: "User pages",
        previousLabel: "Previous",
        nextLabel: "Next",
      }),
    );
  const first = render(1);
  const middle = render(2);
  const last = render(3);

  for (const html of [first, middle, last]) {
    assert.match(html, /<nav aria-label="User pages"/u);
    assert.match(html, /role="group"/u);
    assert.match(html, /aria-current="page"/u);
  }
  assert.match(first, /<span aria-disabled="true"[^>]*>[\s\S]*?class="sr-only">Previous<\/span>/u);
  assert.doesNotMatch(first, /<a aria-label="Previous"/u);
  assert.match(first, /<a aria-label="Next"/u);
  assert.match(middle, /<a aria-label="Previous"/u);
  assert.match(middle, />2 \/ 3<\/span>/u);
  assert.match(middle, /<a aria-label="Next"/u);
  assert.match(last, /<a aria-label="Previous"/u);
  assert.match(last, /<span aria-disabled="true"[^>]*>[\s\S]*?class="sr-only">Next<\/span>/u);
  assert.doesNotMatch(last, /<a aria-label="Next"/u);
});

test("shared Pagination reuses local chevrons and has no route or data ownership", () => {
  const component = source("../app/components/admin/Pagination.tsx");

  assert.match(component, /import Link from "next\/link"/u);
  assert.match(component, /ChevronLeftIcon/u);
  assert.match(component, /ChevronRightIcon/u);
  assert.match(component, /aria-disabled="true"/u);
  assert.doesNotMatch(component, /useRouter|URLSearchParams|fetch\(/u);
});
