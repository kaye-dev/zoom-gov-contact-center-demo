import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import type { SiteLocale } from "./site-settings";

export const FAQ_KNOWLEDGE_BASE_ROOT = join(
  process.cwd(),
  "knowledge-base",
  "自治体-基礎自治体-未来市",
);

export const FAQ_TRANSLATED_LOCALES = [
  "en",
  "zh-Hans",
  "zh-Hant",
  "ko",
] as const satisfies readonly SiteLocale[];

export type FaqTranslatedLocale = (typeof FAQ_TRANSLATED_LOCALES)[number];
export type FaqLocalizedValue<T> = Record<SiteLocale, T>;
export type FaqTranslatedLabels = Record<FaqTranslatedLocale, string>;

export type FaqItem = {
  no: number;
  question: string;
  answer: string;
};

export type ParsedJapaneseFaq = {
  departmentName: string;
  organizationName: string;
  categoryName: string;
  sourceFile: string;
  items: readonly FaqItem[];
};

export type FaqCatalogCategory = {
  slug: string;
  sourceFile: string;
  sourceName: string;
  labels: FaqTranslatedLabels;
  topicTerms: readonly string[];
};

export type FaqCatalogDepartment = {
  slug: string;
  sourceName: string;
  labels: FaqTranslatedLabels;
  organizationSourceName: string;
  organizationLabels: FaqTranslatedLabels;
  categories: readonly FaqCatalogCategory[];
};

export type FaqCatalog = {
  departments: readonly FaqCatalogDepartment[];
};

export type LocalizedFaqCategory = {
  slug: string;
  sourceFile: string;
  labels: FaqLocalizedValue<string>;
  topicTerms: readonly string[];
  items: FaqLocalizedValue<readonly FaqItem[]>;
  sourceDigest: string;
};

export type LocalizedFaqDepartment = {
  number: string;
  slug: string;
  labels: FaqLocalizedValue<string>;
  organizationLabels: FaqLocalizedValue<string>;
  categories: readonly LocalizedFaqCategory[];
};

export type FaqRepository = {
  departments: readonly LocalizedFaqDepartment[];
  departmentCount: number;
  categoryCount: number;
  itemCountPerLocale: number;
};

export type FaqDepartmentSummary = Pick<
  LocalizedFaqDepartment,
  "slug" | "labels" | "organizationLabels"
>;

export type FaqCategorySummary = Pick<LocalizedFaqCategory, "slug" | "labels">;

export type FaqIndexData = {
  departments: readonly FaqDepartmentSummary[];
};

export type FaqDepartmentPageData = FaqDepartmentSummary & {
  categories: readonly FaqCategorySummary[];
};

export type FaqDetailCategoryData = Pick<
  LocalizedFaqCategory,
  "slug" | "labels" | "items"
>;

export type FaqDetailPageData = {
  department: FaqDepartmentSummary;
  category: FaqDetailCategoryData;
};

type TranslationFile = {
  sourceDigest: string;
  translations: Record<
    FaqTranslatedLocale,
    {
      items: FaqItem[];
    }
  >;
};

export class FaqContentError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_CATALOG"
      | "INVALID_MARKDOWN"
      | "INVALID_TRANSLATION"
      | "STALE_TRANSLATION",
    readonly sourcePath?: string,
  ) {
    super(sourcePath ? `${message} (${sourcePath})` : message);
    this.name = "FaqContentError";
  }
}

const DEPARTMENT_DIRECTORY_PATTERN = /^(\d{2})\.(.+)$/;
const FAQ_FILE_PATTERN = /^(\d{2})_(.+)_FAQ\.md$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TABLE_HEADER = "| No | 質問 | 回答 |";
const TABLE_DIVIDER = "|---:|---|---|";
const TABLE_ROW_PATTERN = /^\| (\d+) \| ([^|]+) \| ([^|]+) \|$/;
const FAQ_TABLE_HEADER_INDEX = 15;

function readMetadataValue(
  lines: readonly string[],
  index: number,
  label: string,
  sourcePath: string,
): string {
  const prefix = `${label}：`;
  const line = lines[index];
  if (!line?.startsWith(prefix)) {
    fail("INVALID_MARKDOWN", `${label}が固定位置にありません`, sourcePath);
  }

  const value = line.slice(prefix.length);
  if (value.length === 0 || value.trim() !== value) {
    fail("INVALID_MARKDOWN", `${label}が不正です`, sourcePath);
  }
  return value;
}

function fail(
  code: FaqContentError["code"],
  message: string,
  sourcePath?: string,
): never {
  throw new FaqContentError(message, code, sourcePath);
}

function assertRecord(
  value: unknown,
  code: FaqContentError["code"],
  message: string,
  sourcePath: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(code, message, sourcePath);
  }
}

function parseJson(
  source: string,
  code: FaqContentError["code"],
  sourcePath: string,
): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(code, `JSONを解析できません: ${detail}`, sourcePath);
  }
}

function readJson(sourcePath: string, code: FaqContentError["code"]): unknown {
  try {
    return parseJson(readFileSync(sourcePath, "utf8"), code, sourcePath);
  } catch (error) {
    if (error instanceof FaqContentError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    fail(code, `JSONを読み込めません: ${detail}`, sourcePath);
  }
}

function parseTranslatedLabels(
  value: unknown,
  sourcePath: string,
  fieldName: string,
): FaqTranslatedLabels {
  assertRecord(
    value,
    "INVALID_CATALOG",
    `${fieldName}はオブジェクトである必要があります`,
    sourcePath,
  );

  const labels = {} as FaqTranslatedLabels;
  for (const locale of FAQ_TRANSLATED_LOCALES) {
    const label = value[locale];
    if (typeof label !== "string" || label.trim() !== label || label.length === 0) {
      fail(
        "INVALID_CATALOG",
        `${fieldName}.${locale}には空でない前後空白なしの文字列が必要です`,
        sourcePath,
      );
    }
    labels[locale] = label;
  }

  const keys = Object.keys(value).sort();
  const expectedKeys = [...FAQ_TRANSLATED_LOCALES].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    fail(
      "INVALID_CATALOG",
      `${fieldName}には4翻訳言語だけを指定してください`,
      sourcePath,
    );
  }

  return labels;
}

function requireString(
  value: unknown,
  sourcePath: string,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    fail(
      "INVALID_CATALOG",
      `${fieldName}には空でない前後空白なしの文字列が必要です`,
      sourcePath,
    );
  }
  return value;
}

function requireSlug(value: unknown, sourcePath: string, fieldName: string): string {
  const slug = requireString(value, sourcePath, fieldName);
  if (!SLUG_PATTERN.test(slug)) {
    fail("INVALID_CATALOG", `${fieldName}は英語kebab-caseで指定してください`, sourcePath);
  }
  return slug;
}

export function parseFaqCatalog(sourcePath: string): FaqCatalog {
  const value = readJson(sourcePath, "INVALID_CATALOG");
  assertRecord(value, "INVALID_CATALOG", "カタログのルートが不正です", sourcePath);
  if (!Array.isArray(value.departments)) {
    fail("INVALID_CATALOG", "departments配列が必要です", sourcePath);
  }

  const departments = value.departments.map((departmentValue, departmentIndex) => {
    assertRecord(
      departmentValue,
      "INVALID_CATALOG",
      `departments[${departmentIndex}]が不正です`,
      sourcePath,
    );
    if (!Array.isArray(departmentValue.categories)) {
      fail(
        "INVALID_CATALOG",
        `departments[${departmentIndex}].categories配列が必要です`,
        sourcePath,
      );
    }

    const categories = departmentValue.categories.map((categoryValue, categoryIndex) => {
      assertRecord(
        categoryValue,
        "INVALID_CATALOG",
        `departments[${departmentIndex}].categories[${categoryIndex}]が不正です`,
        sourcePath,
      );
      if (!Array.isArray(categoryValue.topicTerms) || categoryValue.topicTerms.length === 0) {
        fail(
          "INVALID_CATALOG",
          `departments[${departmentIndex}].categories[${categoryIndex}].topicTermsが不正です`,
          sourcePath,
        );
      }
      const topicTerms = categoryValue.topicTerms.map((term, termIndex) =>
        requireString(
          term,
          sourcePath,
          `departments[${departmentIndex}].categories[${categoryIndex}].topicTerms[${termIndex}]`,
        ),
      );

      return {
        slug: requireSlug(
          categoryValue.slug,
          sourcePath,
          `departments[${departmentIndex}].categories[${categoryIndex}].slug`,
        ),
        sourceFile: requireString(
          categoryValue.sourceFile,
          sourcePath,
          `departments[${departmentIndex}].categories[${categoryIndex}].sourceFile`,
        ),
        sourceName: requireString(
          categoryValue.sourceName,
          sourcePath,
          `departments[${departmentIndex}].categories[${categoryIndex}].sourceName`,
        ),
        labels: parseTranslatedLabels(
          categoryValue.labels,
          sourcePath,
          `departments[${departmentIndex}].categories[${categoryIndex}].labels`,
        ),
        topicTerms,
      } satisfies FaqCatalogCategory;
    });

    return {
      slug: requireSlug(
        departmentValue.slug,
        sourcePath,
        `departments[${departmentIndex}].slug`,
      ),
      sourceName: requireString(
        departmentValue.sourceName,
        sourcePath,
        `departments[${departmentIndex}].sourceName`,
      ),
      labels: parseTranslatedLabels(
        departmentValue.labels,
        sourcePath,
        `departments[${departmentIndex}].labels`,
      ),
      organizationSourceName: requireString(
        departmentValue.organizationSourceName,
        sourcePath,
        `departments[${departmentIndex}].organizationSourceName`,
      ),
      organizationLabels: parseTranslatedLabels(
        departmentValue.organizationLabels,
        sourcePath,
        `departments[${departmentIndex}].organizationLabels`,
      ),
      categories,
    } satisfies FaqCatalogDepartment;
  });

  return { departments };
}

export function parseFaqMarkdown(
  source: string,
  sourceFile: string,
  departmentName: string,
): ParsedJapaneseFaq {
  const fileName = basename(sourceFile);
  const fileMatch = FAQ_FILE_PATTERN.exec(fileName);
  if (!fileMatch) {
    fail("INVALID_MARKDOWN", "FAQファイル名が固定形式ではありません", sourceFile);
  }

  const [, fileNumber, categoryName] = fileMatch;
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const expectedHeading = `# ${fileNumber}_${categoryName}_FAQ`;
  if (lines[0] !== expectedHeading) {
    fail("INVALID_MARKDOWN", `見出しは「${expectedHeading}」である必要があります`, sourceFile);
  }

  for (const blankLineIndex of [1, 3, 8, 12, 14]) {
    if (lines[blankLineIndex] !== "") {
      fail("INVALID_MARKDOWN", "メタデータの固定形式が不正です", sourceFile);
    }
  }

  const createdDate = readMetadataValue(lines, 2, "作成日", sourceFile);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdDate)) {
    fail("INVALID_MARKDOWN", "作成日はYYYY-MM-DD形式で指定してください", sourceFile);
  }
  const municipality = readMetadataValue(lines, 4, "自治体設定", sourceFile);
  if (municipality !== "未来市") {
    fail("INVALID_MARKDOWN", "自治体設定は未来市である必要があります", sourceFile);
  }
  readMetadataValue(lines, 5, "所在地", sourceFile);
  readMetadataValue(lines, 6, "代表電話", sourceFile);
  readMetadataValue(lines, 7, "開庁時間", sourceFile);

  const jurisdiction = readMetadataValue(lines, 9, "所管", sourceFile);
  if (jurisdiction !== `未来市の${departmentName}`) {
    fail("INVALID_MARKDOWN", "所管と部署フォルダ名が一致しません", sourceFile);
  }
  const organizationName = readMetadataValue(lines, 10, "組織区分", sourceFile);
  readMetadataValue(lines, 11, "関連情報", sourceFile);
  readMetadataValue(lines, 13, "チャットボット回答方針", sourceFile);

  if (lines[FAQ_TABLE_HEADER_INDEX] !== TABLE_HEADER) {
    fail("INVALID_MARKDOWN", "GFM表の見出しが固定位置にありません", sourceFile);
  }
  const headerIndex = FAQ_TABLE_HEADER_INDEX;
  if (lines[headerIndex + 1] !== TABLE_DIVIDER) {
    fail("INVALID_MARKDOWN", "GFM表の区切り行が固定形式ではありません", sourceFile);
  }

  const items: FaqItem[] = [];
  for (let offset = 0; offset < 10; offset += 1) {
    const line = lines[headerIndex + 2 + offset];
    const rowMatch = line ? TABLE_ROW_PATTERN.exec(line) : null;
    if (!rowMatch) {
      fail("INVALID_MARKDOWN", `FAQ表の${offset + 1}行目が不正です`, sourceFile);
    }
    const no = Number(rowMatch[1]);
    if (no !== offset + 1) {
      fail("INVALID_MARKDOWN", "FAQ番号は1から10まで連続である必要があります", sourceFile);
    }
    const question = rowMatch[2];
    const answer = rowMatch[3];
    if (
      question.length === 0 ||
      question.trim() !== question ||
      answer.length === 0 ||
      answer.trim() !== answer
    ) {
      fail("INVALID_MARKDOWN", "質問と回答には前後空白のない文字列が必要です", sourceFile);
    }
    items.push({ no, question, answer });
  }
  if (lines.slice(headerIndex + 12).some((line) => line !== "")) {
    fail("INVALID_MARKDOWN", "FAQ表の末尾に追加の内容は指定できません", sourceFile);
  }

  return {
    departmentName,
    organizationName,
    categoryName,
    sourceFile: fileName,
    items,
  };
}

export function computeFaqSourceDigest(faq: ParsedJapaneseFaq): string {
  const publicPayload = {
    departmentName: faq.departmentName,
    organizationName: faq.organizationName,
    categoryName: faq.categoryName,
    items: faq.items,
  };
  return createHash("sha256").update(JSON.stringify(publicPayload)).digest("hex");
}

function parseTranslationValue(
  value: unknown,
  expectedDigest: string,
  sourcePath: string,
): TranslationFile {
  assertRecord(value, "INVALID_TRANSLATION", "翻訳JSONのルートが不正です", sourcePath);
  if (typeof value.sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceDigest)) {
    fail("INVALID_TRANSLATION", "sourceDigestが不正です", sourcePath);
  }
  if (value.sourceDigest !== expectedDigest) {
    fail("STALE_TRANSLATION", "日本語原本の更新後に翻訳が更新されていません", sourcePath);
  }
  assertRecord(
    value.translations,
    "INVALID_TRANSLATION",
    "translationsが不正です",
    sourcePath,
  );

  const translations = {} as TranslationFile["translations"];
  for (const locale of FAQ_TRANSLATED_LOCALES) {
    const localeValue = value.translations[locale];
    assertRecord(
      localeValue,
      "INVALID_TRANSLATION",
      `translations.${locale}が不正です`,
      sourcePath,
    );
    if (!Array.isArray(localeValue.items) || localeValue.items.length !== 10) {
      fail(
        "INVALID_TRANSLATION",
        `translations.${locale}.itemsは10件である必要があります`,
        sourcePath,
      );
    }
    const items = localeValue.items.map((itemValue, index) => {
      assertRecord(
        itemValue,
        "INVALID_TRANSLATION",
        `translations.${locale}.items[${index}]が不正です`,
        sourcePath,
      );
      if (itemValue.no !== index + 1) {
        fail(
          "INVALID_TRANSLATION",
          `translations.${locale}のFAQ番号は1から10まで連続である必要があります`,
          sourcePath,
        );
      }
      const question = itemValue.question;
      const answer = itemValue.answer;
      if (
        typeof question !== "string" ||
        question.trim() !== question ||
        question.length === 0 ||
        typeof answer !== "string" ||
        answer.trim() !== answer ||
        answer.length === 0
      ) {
        fail(
          "INVALID_TRANSLATION",
          `translations.${locale}.items[${index}]の質問または回答が不正です`,
          sourcePath,
        );
      }
      return { no: index + 1, question, answer };
    });
    translations[locale] = { items };
  }

  return { sourceDigest: value.sourceDigest, translations };
}

export function parseFaqTranslationJson(
  source: string,
  expectedDigest: string,
  sourcePath = "<FAQ translation>",
): TranslationFile {
  return parseTranslationValue(
    parseJson(source, "INVALID_TRANSLATION", sourcePath),
    expectedDigest,
    sourcePath,
  );
}

function parseTranslationFile(sourcePath: string, expectedDigest: string): TranslationFile {
  return parseTranslationValue(
    readJson(sourcePath, "INVALID_TRANSLATION"),
    expectedDigest,
    sourcePath,
  );
}

function localizedLabels(
  japanese: string,
  translated: FaqTranslatedLabels,
): FaqLocalizedValue<string> {
  return { ja: japanese, ...translated };
}

export function loadFaqRepository(root = FAQ_KNOWLEDGE_BASE_ROOT): FaqRepository {
  const catalogPath = join(root, "_translations", "catalog.json");
  const catalog = parseFaqCatalog(catalogPath);
  if (catalog.departments.length !== 34) {
    fail("INVALID_CATALOG", "カタログには34部署が必要です", catalogPath);
  }

  const directoryEntries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && DEPARTMENT_DIRECTORY_PATTERN.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (directoryEntries.length !== 34) {
    fail("INVALID_CATALOG", "ナレッジには34部署フォルダが必要です", root);
  }

  const departmentSlugs = new Set<string>();
  const categorySlugs = new Set<string>();
  const organizationTranslations = new Map<string, string>();
  const departments = catalog.departments.map((catalogDepartment, index) => {
    const expectedNumber = String(index + 1).padStart(2, "0");
    const directory = directoryEntries[index];
    const directoryMatch = DEPARTMENT_DIRECTORY_PATTERN.exec(directory.name);
    if (
      !directoryMatch ||
      directoryMatch[1] !== expectedNumber ||
      directoryMatch[2] !== catalogDepartment.sourceName
    ) {
      fail(
        "INVALID_CATALOG",
        `カタログの部署${expectedNumber}と実在フォルダが一致しません`,
        catalogPath,
      );
    }
    if (departmentSlugs.has(catalogDepartment.slug)) {
      fail("INVALID_CATALOG", "部署slugが重複しています", catalogPath);
    }
    departmentSlugs.add(catalogDepartment.slug);

    if (catalogDepartment.categories.length !== 5) {
      fail(
        "INVALID_CATALOG",
        `${catalogDepartment.sourceName}には5カテゴリが必要です`,
        catalogPath,
      );
    }
    for (const locale of FAQ_TRANSLATED_LOCALES) {
      const key = `${catalogDepartment.organizationSourceName}:${locale}`;
      const existing = organizationTranslations.get(key);
      const label = catalogDepartment.organizationLabels[locale];
      if (existing !== undefined && existing !== label) {
        fail("INVALID_CATALOG", "同じ組織区分の翻訳が一致しません", catalogPath);
      }
      organizationTranslations.set(key, label);
    }

    const departmentPath = join(root, directory.name);
    const markdownFiles = readdirSync(departmentPath).filter((fileName) =>
      fileName.endsWith(".md"),
    );
    if (markdownFiles.some((fileName) => !FAQ_FILE_PATTERN.test(fileName))) {
      fail(
        "INVALID_CATALOG",
        `${catalogDepartment.sourceName}に固定形式ではないMarkdownがあります`,
        departmentPath,
      );
    }
    const actualFiles = markdownFiles
      .sort((left, right) => left.localeCompare(right, "en"));
    if (actualFiles.length !== 5) {
      fail(
        "INVALID_CATALOG",
        `${catalogDepartment.sourceName}には5つのFAQ Markdownが必要です`,
        departmentPath,
      );
    }

    const categories = catalogDepartment.categories.map((catalogCategory, categoryIndex) => {
      const expectedFileNumber = String(categoryIndex + 1).padStart(2, "0");
      if (
        actualFiles[categoryIndex] !== catalogCategory.sourceFile ||
        !catalogCategory.sourceFile.startsWith(`${expectedFileNumber}_`)
      ) {
        fail(
          "INVALID_CATALOG",
          `${catalogDepartment.sourceName}のカテゴリ${expectedFileNumber}と実在ファイルが一致しません`,
          catalogPath,
        );
      }
      const categorySlugKey = `${catalogDepartment.slug}/${catalogCategory.slug}`;
      if (categorySlugs.has(categorySlugKey)) {
        fail("INVALID_CATALOG", "部署内のFAQ slugが重複しています", catalogPath);
      }
      categorySlugs.add(categorySlugKey);

      const markdownPath = join(departmentPath, catalogCategory.sourceFile);
      const japanese = parseFaqMarkdown(
        readFileSync(markdownPath, "utf8"),
        markdownPath,
        catalogDepartment.sourceName,
      );
      if (
        japanese.categoryName !== catalogCategory.sourceName ||
        japanese.organizationName !== catalogDepartment.organizationSourceName
      ) {
        fail(
          "INVALID_CATALOG",
          "カタログとMarkdownのカテゴリ名または組織区分が一致しません",
          catalogPath,
        );
      }
      const expectedTopicSummary = `主な内容は${catalogCategory.topicTerms.join("、")}です。`;
      if (!japanese.items[0].answer.includes(expectedTopicSummary)) {
        fail(
          "INVALID_CATALOG",
          "カタログのtopicTermsとMarkdownの主な内容が一致しません",
          catalogPath,
        );
      }

      const sourceDigest = computeFaqSourceDigest(japanese);
      const translationPath = join(
        root,
        "_translations",
        "faqs",
        catalogDepartment.slug,
        `${catalogCategory.slug}.json`,
      );
      const translation = parseTranslationFile(translationPath, sourceDigest);
      const items = { ja: japanese.items } as FaqLocalizedValue<readonly FaqItem[]>;
      for (const locale of FAQ_TRANSLATED_LOCALES) {
        items[locale] = translation.translations[locale].items;
      }

      return {
        slug: catalogCategory.slug,
        sourceFile: catalogCategory.sourceFile,
        labels: localizedLabels(catalogCategory.sourceName, catalogCategory.labels),
        topicTerms: catalogCategory.topicTerms,
        items,
        sourceDigest,
      } satisfies LocalizedFaqCategory;
    });

    return {
      number: expectedNumber,
      slug: catalogDepartment.slug,
      labels: localizedLabels(catalogDepartment.sourceName, catalogDepartment.labels),
      organizationLabels: localizedLabels(
        catalogDepartment.organizationSourceName,
        catalogDepartment.organizationLabels,
      ),
      categories,
    } satisfies LocalizedFaqDepartment;
  });

  return {
    departments,
    departmentCount: departments.length,
    categoryCount: departments.reduce((count, department) => count + department.categories.length, 0),
    itemCountPerLocale: departments.reduce(
      (count, department) =>
        count + department.categories.reduce((subtotal, category) => subtotal + category.items.ja.length, 0),
      0,
    ),
  };
}

let defaultRepository: FaqRepository | undefined;

export function getFaqRepository(): FaqRepository {
  defaultRepository ??= loadFaqRepository();
  return defaultRepository;
}

function departmentSummary(department: LocalizedFaqDepartment): FaqDepartmentSummary {
  return {
    slug: department.slug,
    labels: department.labels,
    organizationLabels: department.organizationLabels,
  };
}

export function getFaqIndexData(): FaqIndexData {
  return {
    departments: getFaqRepository().departments.map(departmentSummary),
  };
}

export function getFaqDepartment(slug: string): LocalizedFaqDepartment | undefined {
  return getFaqRepository().departments.find((department) => department.slug === slug);
}

export function getFaqDepartmentPageData(slug: string): FaqDepartmentPageData | undefined {
  const department = getFaqDepartment(slug);
  if (!department) return undefined;

  return {
    ...departmentSummary(department),
    categories: department.categories.map(({ slug: categorySlug, labels }) => ({
      slug: categorySlug,
      labels,
    })),
  };
}

export function getFaqCategory(
  departmentSlug: string,
  categorySlug: string,
):
  | {
      department: LocalizedFaqDepartment;
      category: LocalizedFaqCategory;
    }
  | undefined {
  const department = getFaqDepartment(departmentSlug);
  const category = department?.categories.find((item) => item.slug === categorySlug);
  return department && category ? { department, category } : undefined;
}

export function getFaqDetailPageData(
  departmentSlug: string,
  categorySlug: string,
): FaqDetailPageData | undefined {
  const result = getFaqCategory(departmentSlug, categorySlug);
  if (!result) return undefined;

  return {
    department: departmentSummary(result.department),
    category: {
      slug: result.category.slug,
      labels: result.category.labels,
      items: result.category.items,
    },
  };
}

export function getFaqDepartmentStaticParams(): Array<{ department: string }> {
  return getFaqRepository().departments.map((department) => ({ department: department.slug }));
}

export function getFaqCategoryStaticParams(): Array<{ department: string; faq: string }> {
  return getFaqRepository().departments.flatMap((department) =>
    department.categories.map((category) => ({
      department: department.slug,
      faq: category.slug,
    })),
  );
}
