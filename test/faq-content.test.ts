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

test("FAQ loader uses the tracked docs knowledge-base root", () => {
  assert.equal(
    FAQ_KNOWLEDGE_BASE_ROOT,
    join(
      process.cwd(),
      "docs",
      "knowledge-base",
      "自治体-基礎自治体-未来市",
    ),
  );
});

test("My Number and bulky-waste demo FAQs are localized without filling handoff gaps", () => {
  const myNumber = repository.departments
    .find(({ slug }) => slug === "resident-services")
    ?.categories.find(({ slug }) => slug === "my-number");
  const bulkyWaste = repository.departments
    .find(({ slug }) => slug === "zero-waste-promotion")
    ?.categories.find(({ slug }) => slug === "bulky-waste");
  assert.ok(myNumber);
  assert.ok(bulkyWaste);

  const myNumberTerms: Record<(typeof SITE_LOCALES)[number], readonly RegExp[]> = {
    ja: [
      /数字4桁/u,
      /3回連続/u,
      /iPhoneの上部/u,
      /モバイル非接触IC通信マーク/u,
      /ケース/u,
      /動かさず/u,
      /有効期限/u,
    ],
    en: [
      /four-digit/u,
      /three consecutive/u,
      /top of the iPhone/u,
      /mobile contactless IC communication mark/u,
      /case/u,
      /without moving/u,
      /expir/u,
    ],
    "zh-Hans": [
      /4位数字/u,
      /连续输错3次/u,
      /iPhone顶部/u,
      /非接触式IC通信标志/u,
      /手机壳/u,
      /保持不动|不要移动/u,
      /有效期/u,
    ],
    "zh-Hant": [
      /4位數字/u,
      /連續輸錯3次/u,
      /iPhone頂部/u,
      /非接觸式IC通訊標誌/u,
      /手機殼/u,
      /保持不動|不要移動/u,
      /有效期/u,
    ],
    ko: [
      /숫자 4자리/u,
      /3회 연속/u,
      /iPhone 상단/u,
      /모바일 비접촉 IC 통신 마크/u,
      /케이스/u,
      /움직이지/u,
      /유효기간/u,
    ],
  };
  const bulkyWasteTerms: Record<(typeof SITE_LOCALES)[number], readonly RegExp[]> = {
    ja: [/品目/u, /大きさ/u, /数量/u, /排出場所/u, /収集日/u, /手数料/u, /処理券/u],
    en: [
      /item/u,
      /dimensions/u,
      /quantity/u,
      /set-out location/u,
      /collection date/u,
      /fee/u,
      /disposal ticket/u,
    ],
    "zh-Hans": [/品目/u, /尺寸/u, /数量/u, /投放地点/u, /收集日期/u, /手续费/u, /处理券/u],
    "zh-Hant": [/品目/u, /尺寸/u, /數量/u, /投放地點/u, /收集日期/u, /手續費/u, /處理券/u],
    ko: [/품목/u, /크기/u, /수량/u, /배출 장소/u, /수거일/u, /수수료/u, /처리권/u],
  };

  for (const locale of SITE_LOCALES) {
    assert.equal(myNumber.items[locale].length, 10);
    assert.equal(bulkyWaste.items[locale].length, 10);
    const myNumberText = myNumber.items[locale]
      .map(({ question, answer }) => `${question}\n${answer}`)
      .join("\n");
    const bulkyWasteText = bulkyWaste.items[locale]
      .map(({ question, answer }) => `${question}\n${answer}`)
      .join("\n");
    for (const term of myNumberTerms[locale]) {
      assert.match(myNumberText, term, `${locale} My Number guidance is incomplete`);
    }
    for (const term of bulkyWasteTerms[locale]) {
      assert.match(bulkyWasteText, term, `${locale} bulky-waste guidance is incomplete`);
    }
  }

  const myNumberHandoffGapProhibitions: Record<
    (typeof SITE_LOCALES)[number],
    readonly RegExp[]
  > = {
    ja: [
      /ロック解除.{0,20}(?:持ち物|必要書類|本人確認書類)/u,
      /コンビニ(?:エンスストア)?.{0,20}(?:初期化|再設定)/u,
      /当日(?:中)?.{0,20}(?:対応|解除|手続き)/u,
    ],
    en: [
      /(?:documents?|items?) (?:required|needed).{0,30}(?:unlock|reset)/iu,
      /convenience store.{0,40}(?:initiali[sz]e|reset)/iu,
      /(?:same[- ]day|completed today).{0,30}(?:service|reset|unlock|procedure)?/iu,
    ],
    "zh-Hans": [
      /解除锁定.{0,20}(?:携带物品|所需材料|身份证明)/u,
      /便利店.{0,20}(?:初始化|重置)/u,
      /(?:当天|当日).{0,20}(?:办理|处理|解除)/u,
    ],
    "zh-Hant": [
      /解除鎖定.{0,20}(?:攜帶物品|所需文件|身分證明)/u,
      /便利商店.{0,20}(?:初始化|重設)/u,
      /(?:當天|當日).{0,20}(?:辦理|處理|解除)/u,
    ],
    ko: [
      /잠금 해제.{0,20}(?:준비물|필요 서류|신분증)/u,
      /편의점.{0,20}(?:초기화|재설정)/u,
      /당일.{0,20}(?:처리|해제|완료)/u,
    ],
  };
  for (const locale of SITE_LOCALES) {
    const localizedText = myNumber.items[locale]
      .map(({ question, answer }) => `${question}\n${answer}`)
      .join("\n");
    for (const unsupportedDetail of myNumberHandoffGapProhibitions[locale]) {
      assert.doesNotMatch(
        localizedText,
        unsupportedDetail,
        `${locale} My Number knowledge must preserve the handoff gap`,
      );
    }
  }

  const bulkyWasteAllLocales = SITE_LOCALES.flatMap((locale) =>
    bulkyWaste.items[locale].map(({ question, answer }) => `${question}\n${answer}`),
  ).join("\n");
  assert.doesNotMatch(
    bulkyWasteAllLocales,
    /(?:¥|￥)\s*\d|\d[\d,.]*\s*(?:円|yen|yuan|won|元|원)/iu,
    "bulky-waste knowledge must not invent an exact fee",
  );
  const bulkyWasteGapIndicators: Record<
    (typeof SITE_LOCALES)[number],
    readonly RegExp[]
  > = {
    ja: [/正確な料金や空き状況を確認できない/u, /対象条件や個別判断に必要な情報がありません/u],
    en: [/cannot confirm an exact fee or collection availability/iu, /does not contain the eligibility requirements or information needed for an individual decision/iu],
    "zh-Hans": [/无法确认准确费用或收集名额/u, /不包含搬出协助的适用条件或进行个别判断所需的信息/u],
    "zh-Hant": [/無法確認準確費用或收集名額/u, /不包含搬出協助的適用條件或進行個別判斷所需的資訊/u],
    ko: [/정확한 요금이나 수거 가능 여부를 확인할 수 없/u, /운반 지원의 대상 조건이나 개별 판단에 필요한 정보가 없습니다/u],
  };
  const bulkyWasteHandoffGapProhibitions: Record<
    (typeof SITE_LOCALES)[number],
    readonly RegExp[]
  > = {
    ja: [
      /\d{1,2}月\d{1,2}日/u,
      /(?:空き|予約可能)(?:があります|です)/u,
      /予約(?:を|が)?確定(?:しました|済みです)/u,
      /(?:要介護|障害者手帳|高齢者のみ|65歳以上)/u,
    ],
    en: [
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/iu,
      /\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/u,
      /(?:slot|collection date) (?:is|remains) available/iu,
      /(?:reservation|booking) (?:is|has been) confirmed/iu,
      /(?:care level|disability certificate|aged? 65|65 years? or older)/iu,
    ],
    "zh-Hans": [
      /\d{1,2}月\d{1,2}日/u,
      /(?:有空位|有空档|可以预约)/u,
      /预约(?:已经|已)?确认/u,
      /(?:护理等级|残疾人证|仅限老年人|65岁以上)/u,
    ],
    "zh-Hant": [
      /\d{1,2}月\d{1,2}日/u,
      /(?:有空位|有空檔|可以預約)/u,
      /預約(?:已經|已)?確認/u,
      /(?:照護等級|身心障礙手冊|僅限高齡者|65歲以上)/u,
    ],
    ko: [
      /\d{1,2}월\s*\d{1,2}일/u,
      /(?:빈자리|예약 가능)(?:이 있습니다|합니다)/u,
      /예약(?:이|을)? 확정(?:했습니다|되었습니다)/u,
      /(?:요양 등급|장애인 수첩|고령자만|65세 이상)/u,
    ],
  };
  for (const locale of SITE_LOCALES) {
    const collectionAnswer = bulkyWaste.items[locale][5].answer;
    const carryOutAnswer = bulkyWaste.items[locale][9].answer;
    for (const indicator of bulkyWasteGapIndicators[locale]) {
      assert.match(
        `${collectionAnswer}\n${carryOutAnswer}`,
        indicator,
        `${locale} bulky-waste knowledge must state its handoff gap`,
      );
    }
    const localizedText = bulkyWaste.items[locale]
      .map(({ question, answer }) => `${question}\n${answer}`)
      .join("\n");
    for (const unsupportedDetail of bulkyWasteHandoffGapProhibitions[locale]) {
      assert.doesNotMatch(
        localizedText,
        unsupportedDetail,
        `${locale} bulky-waste knowledge must not fill booking or assistance gaps`,
      );
    }
  }

  for (const category of [myNumber, bulkyWaste]) {
    const translationPath = join(
      FAQ_KNOWLEDGE_BASE_ROOT,
      "_translations",
      "faqs",
      repository.departments.find((department) =>
        department.categories.some(({ slug }) => slug === category.slug),
      )?.slug ?? "",
      `${category.slug}.json`,
    );
    const translation = JSON.parse(readFileSync(translationPath, "utf8")) as {
      sourceDigest: string;
    };
    assert.equal(translation.sourceDigest, category.sourceDigest);
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
