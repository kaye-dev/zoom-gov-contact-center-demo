import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { FAQ_LEGACY_REDIRECTS } from "../next.config";
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

function readKnowledgeBaseTextRecursively(directoryPath: string): string {
  return readdirSync(directoryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map((entry) => {
      const entryPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return `${entryPath}\n${readKnowledgeBaseTextRecursively(entryPath)}`;
      }
      if (!entry.name.endsWith(".md") && !entry.name.endsWith(".json")) {
        return entryPath;
      }
      return `${entryPath}\n${readFileSync(entryPath, "utf8")}`;
    })
    .join("\n");
}

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

test("generic department names and route slugs replace Hino-specific identifiers", () => {
  const expectedDepartments = [
    {
      number: "11",
      name: "行政サービスセンター",
      slug: "administrative-service-center",
    },
    {
      number: "21",
      name: "福祉総合相談窓口",
      slug: "welfare-consultation-desk",
    },
    { number: "31", name: "教育支援課", slug: "education-support" },
  ];

  for (const expected of expectedDepartments) {
    const department = repository.departments.find(
      ({ number }) => number === expected.number,
    );
    assert.ok(department, `department ${expected.number} must exist`);
    assert.equal(department.labels.ja, expected.name);
    assert.equal(department.slug, expected.slug);
  }

  const administrativeServiceCenter = repository.departments.find(
    ({ slug }) => slug === "administrative-service-center",
  );
  assert.ok(administrativeServiceCenter);
  assert.deepEqual(
    administrativeServiceCenter.categories.map(({ slug }) => slug),
    [
      "service-counter-guide",
      "certificate-issuance",
      "address-change-notifications",
      "community-consultations",
      "location-and-access",
    ],
  );

  const knowledgeBaseText = readKnowledgeBaseTextRecursively(
    FAQ_KNOWLEDGE_BASE_ROOT,
  );
  const legacyTerms = [
    "七生",
    "Nanao",
    "nanao-branch-office",
    "나나오",
    "支所窓口案内",
    "branch-office-services",
    "支所アクセス",
    "branch-office-access",
    "セーフティネットコールセンター",
    "Safety Net Call Center",
    "safety-net-call-center",
    "社会安全网呼叫中心",
    "社會安全網客服中心",
    "세이프티넷 콜센터",
    "発達・教育支援課",
    "Developmental and Educational Support Division (Education Department)",
    "developmental-education-support",
    "发展与教育支援课（教育部）",
    "發展與教育支援課（教育部）",
    "발달·교육지원과(교육부)",
  ];
  for (const legacyTerm of legacyTerms) {
    assert.equal(
      knowledgeBaseText.includes(legacyTerm),
      false,
      `legacy Hino-specific identifier remains: ${legacyTerm}`,
    );
  }
});

test("legacy FAQ department routes temporarily redirect to generic slugs", () => {
  const migratedDepartmentRedirects = FAQ_LEGACY_REDIRECTS.filter((redirect) =>
    /nanao-branch-office|safety-net-call-center|developmental-education-support/.test(
      redirect.source,
    ),
  );

  assert.deepEqual(migratedDepartmentRedirects, [
    {
      source:
        "/life/frequently-asked-questions/nanao-branch-office/branch-office-services",
      destination:
        "/life/frequently-asked-questions/administrative-service-center/service-counter-guide",
      permanent: false,
    },
    {
      source:
        "/life/frequently-asked-questions/nanao-branch-office/branch-office-access",
      destination:
        "/life/frequently-asked-questions/administrative-service-center/location-and-access",
      permanent: false,
    },
    {
      source: "/life/frequently-asked-questions/nanao-branch-office/:faq*",
      destination:
        "/life/frequently-asked-questions/administrative-service-center/:faq*",
      permanent: false,
    },
    {
      source: "/life/frequently-asked-questions/safety-net-call-center/:faq*",
      destination:
        "/life/frequently-asked-questions/welfare-consultation-desk/:faq*",
      permanent: false,
    },
    {
      source:
        "/life/frequently-asked-questions/developmental-education-support/:faq*",
      destination: "/life/frequently-asked-questions/education-support/:faq*",
      permanent: false,
    },
  ]);
  assert.ok(migratedDepartmentRedirects.every(({ permanent }) => !permanent));
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
