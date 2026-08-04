import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  FAQ_KNOWLEDGE_BASE_ROOT,
  FaqContentError,
  getFaqCategoryStaticParams,
  getFaqDepartmentStaticParams,
  getFaqDepartmentPageData,
  getFaqDetailPageData,
  getFaqIndexData,
  loadFaqRepository,
  parseFaqMarkdown,
  parseFaqTranslationJson,
} from "../lib/faq-content";
import { SITE_LOCALES } from "../lib/site-settings";

const repository = loadFaqRepository();

function assertThrowsFaqCode(
  action: () => unknown,
  code: FaqContentError["code"],
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof FaqContentError);
    assert.equal(error.code, code);
    return true;
  });
}

test("FAQ repository contains 34 sequential departments, 170 categories, and 1,700 items per locale", () => {
  assert.equal(repository.departmentCount, 34);
  assert.equal(repository.categoryCount, 170);
  assert.equal(repository.itemCountPerLocale, 1_700);
  assert.deepEqual(
    repository.departments.map(({ number }) => number),
    Array.from({ length: 34 }, (_, index) => String(index + 1).padStart(2, "0")),
  );

  let categoryCount = 0;
  for (const department of repository.departments) {
    assert.equal(department.categories.length, 5, department.labels.ja);
    assert.deepEqual(
      department.categories.map(({ sourceFile }) => sourceFile.slice(0, 2)),
      ["01", "02", "03", "04", "05"],
      department.labels.ja,
    );

    const departmentPath = join(
      FAQ_KNOWLEDGE_BASE_ROOT,
      `${department.number}.${department.labels.ja}`,
    );
    const sourceFiles = readdirSync(departmentPath)
      .filter((fileName) => /^\d{2}_.+_FAQ\.md$/.test(fileName))
      .sort((left, right) => left.localeCompare(right, "en"));
    assert.deepEqual(
      sourceFiles,
      department.categories.map(({ sourceFile }) => sourceFile),
      department.labels.ja,
    );

    for (const category of department.categories) {
      categoryCount += 1;
      for (const locale of SITE_LOCALES) {
        assert.equal(category.items[locale].length, 10);
        assert.deepEqual(
          category.items[locale].map(({ no }) => no),
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        );
      }
    }
  }
  assert.equal(categoryCount, 170);
});

test("knowledge-base structure document matches the loaded departments and totals", () => {
  const structure = readFileSync(
    join(FAQ_KNOWLEDGE_BASE_ROOT, "00_ナレッジ構成.md"),
    "utf8",
  );
  assert.match(structure, /^課・窓口フォルダ数：34$/m);
  assert.match(structure, /^FAQ ファイル数：170$/m);
  assert.match(structure, /^FAQ 件数：1 言語あたり 1,700$/m);

  const documentedRows = structure
    .split(/\r?\n/)
    .filter((line) => /^\| \d{2}\./.test(line))
    .map((line) => {
      const [, department, organization, categories] = line
        .split("|")
        .map((cell) => cell.trim());
      return { department, organization, categories };
    });
  const loadedRows = repository.departments.map((department) => ({
    department: `${department.number}.${department.labels.ja}`,
    organization: department.organizationLabels.ja,
    categories: department.categories
      .map((category) => category.labels.ja)
      .join("、"),
  }));

  assert.equal(documentedRows.length, 34);
  assert.deepEqual(documentedRows, loadedRows);
});

test("every department, organization, category, question, and answer has all five locales", () => {
  for (const department of repository.departments) {
    for (const locale of SITE_LOCALES) {
      assert.equal(department.labels[locale].trim(), department.labels[locale]);
      assert.ok(department.labels[locale].length > 0);
      assert.equal(
        department.organizationLabels[locale].trim(),
        department.organizationLabels[locale],
      );
      assert.ok(department.organizationLabels[locale].length > 0);
    }

    for (const category of department.categories) {
      for (const locale of SITE_LOCALES) {
        assert.equal(category.labels[locale].trim(), category.labels[locale]);
        assert.ok(category.labels[locale].length > 0);
        for (const item of category.items[locale]) {
          assert.equal(item.question.trim(), item.question);
          assert.ok(item.question.length > 0);
          assert.equal(item.answer.trim(), item.answer);
          assert.ok(item.answer.length > 0);
        }
      }
    }
  }
});

test("department and nested category route slugs are unique", () => {
  const departmentSlugs = repository.departments.map(({ slug }) => slug);
  const categoryRoutes = repository.departments.flatMap((department) =>
    department.categories.map((category) => `${department.slug}/${category.slug}`),
  );

  assert.equal(new Set(departmentSlugs).size, 34);
  assert.equal(new Set(categoryRoutes).size, 170);
  assert.deepEqual(
    getFaqDepartmentStaticParams().map(({ department }) => department),
    departmentSlugs,
  );
  assert.deepEqual(
    getFaqCategoryStaticParams().map(({ department, faq }) => `${department}/${faq}`),
    categoryRoutes,
  );
  for (const slug of [...departmentSlugs, ...categoryRoutes.flatMap((route) => route.split("/"))]) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test("public FAQ projections exclude management metadata", () => {
  const firstDepartment = repository.departments[0];
  const firstCategory = firstDepartment.categories[0];
  const indexData = getFaqIndexData();
  const departmentData = getFaqDepartmentPageData(firstDepartment.slug);
  const detailData = getFaqDetailPageData(firstDepartment.slug, firstCategory.slug);

  assert.ok(departmentData);
  assert.ok(detailData);
  assert.deepEqual(Object.keys(indexData).sort(), ["departments"]);
  assert.deepEqual(Object.keys(indexData.departments[0]).sort(), [
    "labels",
    "organizationLabels",
    "slug",
  ]);
  assert.deepEqual(Object.keys(departmentData).sort(), [
    "categories",
    "labels",
    "organizationLabels",
    "slug",
  ]);
  assert.deepEqual(Object.keys(departmentData.categories[0]).sort(), [
    "labels",
    "slug",
  ]);
  assert.deepEqual(Object.keys(detailData).sort(), ["category", "department"]);
  assert.deepEqual(Object.keys(detailData.department).sort(), [
    "labels",
    "organizationLabels",
    "slug",
  ]);
  assert.deepEqual(Object.keys(detailData.category).sort(), ["items", "labels", "slug"]);
  for (const locale of SITE_LOCALES) {
    assert.deepEqual(Object.keys(detailData.category.items[locale][0]).sort(), [
      "answer",
      "no",
      "question",
    ]);
  }

  const projectedJson = JSON.stringify({ indexData, departmentData, detailData });
  for (const managementKey of [
    "sourceFile",
    "sourceDigest",
    "sourceName",
    "topicTerms",
    "departmentName",
    "organizationName",
  ]) {
    assert.equal(projectedJson.includes(`\"${managementKey}\"`), false);
  }
});

test("unknown department and category slugs return undefined", () => {
  const firstDepartment = repository.departments[0];
  const firstCategory = firstDepartment.categories[0];

  assert.equal(getFaqDepartmentPageData("unknown-department"), undefined);
  assert.equal(
    getFaqDetailPageData("unknown-department", firstCategory.slug),
    undefined,
  );
  assert.equal(
    getFaqDetailPageData(firstDepartment.slug, "unknown-category"),
    undefined,
  );
});

test("parseFaqMarkdown rejects missing metadata and malformed GFM tables", () => {
  const department = repository.departments[0];
  const category = department.categories[0];
  const sourcePath = join(
    FAQ_KNOWLEDGE_BASE_ROOT,
    `${department.number}.${department.labels.ja}`,
    category.sourceFile,
  );
  const validSource = readFileSync(sourcePath, "utf8");

  const malformedTable = validSource.replace(
    "|---:|---|---|",
    "| --- | --- | --- |",
  );
  assert.notEqual(malformedTable, validSource);
  assertThrowsFaqCode(
    () => parseFaqMarkdown(malformedTable, sourcePath, department.labels.ja),
    "INVALID_MARKDOWN",
  );

  const missingJurisdiction = validSource.replace(/^所管：.*\n/m, "");
  assert.notEqual(missingJurisdiction, validSource);
  assertThrowsFaqCode(
    () => parseFaqMarkdown(missingJurisdiction, sourcePath, department.labels.ja),
    "INVALID_MARKDOWN",
  );

  const missingCreatedDate = validSource.replace(/^作成日：.*\n/m, "");
  assert.notEqual(missingCreatedDate, validSource);
  assertThrowsFaqCode(
    () => parseFaqMarkdown(missingCreatedDate, sourcePath, department.labels.ja),
    "INVALID_MARKDOWN",
  );

  const blankQuestion = validSource.replace(/^\| 1 \| [^|]+ \|/m, "| 1 |   |");
  assert.notEqual(blankQuestion, validSource);
  assertThrowsFaqCode(
    () => parseFaqMarkdown(blankQuestion, sourcePath, department.labels.ja),
    "INVALID_MARKDOWN",
  );

  const additionalRow = `${validSource.trimEnd()}\n| 11 | 追加の質問 | 追加の回答 |\n`;
  assertThrowsFaqCode(
    () => parseFaqMarkdown(additionalRow, sourcePath, department.labels.ja),
    "INVALID_MARKDOWN",
  );
});

test("parseFaqTranslationJson rejects a stale digest and a missing locale", () => {
  const department = repository.departments[0];
  const category = department.categories[0];
  const sourcePath = join(
    FAQ_KNOWLEDGE_BASE_ROOT,
    "_translations",
    "faqs",
    department.slug,
    `${category.slug}.json`,
  );
  const validTranslation = JSON.parse(readFileSync(sourcePath, "utf8")) as {
    sourceDigest: string;
    translations: Record<string, unknown>;
  };

  const staleTranslation = structuredClone(validTranslation);
  staleTranslation.sourceDigest = "0".repeat(64);
  assertThrowsFaqCode(
    () =>
      parseFaqTranslationJson(
        JSON.stringify(staleTranslation),
        category.sourceDigest,
        sourcePath,
      ),
    "STALE_TRANSLATION",
  );

  const missingTranslation = structuredClone(validTranslation);
  delete missingTranslation.translations.ko;
  assertThrowsFaqCode(
    () =>
      parseFaqTranslationJson(
        JSON.stringify(missingTranslation),
        category.sourceDigest,
        sourcePath,
      ),
    "INVALID_TRANSLATION",
  );
});
