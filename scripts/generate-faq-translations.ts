import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  FAQ_KNOWLEDGE_BASE_ROOT,
  computeFaqSourceDigest,
  parseFaqCatalog,
  parseFaqMarkdown,
} from "../lib/faq-content";
import {
  faqTranslationLocales,
  faqTranslationTemplates,
  type FaqQ10AnswerVariant,
  type FaqQ3AnswerVariant,
  type FaqQ4AnswerVariant,
  type FaqQ5AnswerVariant,
  type FaqQ6AnswerVariant,
  type FaqQuestionNumber,
  type FaqTranslationLocale,
  type FaqTranslationTemplateSet,
} from "./faq-translation-templates";

const municipalityNames: Readonly<Record<FaqTranslationLocale, string>> = {
  en: "Mirai City",
  "zh-Hans": "未来市",
  "zh-Hant": "未來市",
  ko: "미래시",
};

type TemplateValues = {
  municipality: string;
  department: string;
  category: string;
  topicTerms: string;
};

function fillTemplate(template: string, values: TemplateValues): string {
  const result = template.replace(
    /\{(municipality|department|category|topicTerms)\}/g,
    (_, key: keyof TemplateValues) => values[key],
  );
  if (/\{[^}]+\}/.test(result)) {
    throw new Error(`Unknown placeholder remained in translation: ${result}`);
  }
  return result;
}

function q3Variant(answer: string): FaqQ3AnswerVariant {
  if (answer.startsWith("申請書、本人確認書類、世帯状況")) return "household";
  if (answer.startsWith("本人確認書類、保険証")) return "health";
  if (answer.startsWith("所在地、図面")) return "property";
  if (answer.startsWith("通知書、納付書")) return "payment";
  if (answer.startsWith("本人確認書類、対象者との関係")) return "identity";
  return "standard";
}

function q4Variant(answer: string): FaqQ4AnswerVariant {
  if (answer.startsWith("電話、窓口、地域の相談拠点")) return "consultation";
  if (answer.startsWith("公式サイトの案内、専用受付")) return "field";
  if (answer.startsWith("施設窓口、公共施設予約システム")) return "facility";
  if (answer.startsWith("未来市役所本庁舎、支所")) return "certificate";
  if (answer.startsWith("納付書、口座振替")) return "payment";
  return "standard";
}

function q5Variant(answer: string): FaqQ5AnswerVariant {
  if (answer.startsWith("期限が定められている手続き")) return "deadline";
  if (answer.startsWith("緊急性がある場合")) return "emergency";
  return "standard";
}

function q6Variant(answer: string): FaqQ6AnswerVariant {
  if (answer.startsWith("助成や給付")) return "benefit";
  if (answer.startsWith("利用料、使用料")) return "usage";
  if (answer.startsWith("証明書の発行")) return "certificate";
  return "standard";
}

function q10Variant(answer: string): FaqQ10AnswerVariant {
  if (answer.includes("機微情報はチャットに入力しないでください")) return "sensitive";
  if (answer.includes("所在地、所有関係、現地状況")) return "property";
  if (answer.includes("緊急時はチャットではなく")) return "emergency";
  return "standard";
}

function answerTemplate(
  templates: FaqTranslationTemplateSet,
  no: FaqQuestionNumber,
  japaneseAnswer: string,
): string {
  switch (no) {
    case 1:
      return templates.answers.q1;
    case 2:
      return templates.answers.q2;
    case 3:
      return templates.answers.q3[q3Variant(japaneseAnswer)];
    case 4:
      return templates.answers.q4[q4Variant(japaneseAnswer)];
    case 5:
      return templates.answers.q5[q5Variant(japaneseAnswer)];
    case 6:
      return templates.answers.q6[q6Variant(japaneseAnswer)];
    case 7:
      return templates.answers.q7;
    case 8:
      return templates.answers.q8;
    case 9:
      return templates.answers.q9;
    case 10:
      return templates.answers.q10[q10Variant(japaneseAnswer)];
  }
}

const catalogPath = join(FAQ_KNOWLEDGE_BASE_ROOT, "_translations", "catalog.json");
const catalog = parseFaqCatalog(catalogPath);

for (const [departmentIndex, department] of catalog.departments.entries()) {
  const directoryName = `${String(departmentIndex + 1).padStart(2, "0")}.${department.sourceName}`;
  const outputDirectory = join(
    FAQ_KNOWLEDGE_BASE_ROOT,
    "_translations",
    "faqs",
    department.slug,
  );
  mkdirSync(outputDirectory, { recursive: true });

  for (const category of department.categories) {
    const markdownPath = join(FAQ_KNOWLEDGE_BASE_ROOT, directoryName, category.sourceFile);
    const japanese = parseFaqMarkdown(
      readFileSync(markdownPath, "utf8"),
      markdownPath,
      department.sourceName,
    );

    const translations = Object.fromEntries(
      faqTranslationLocales.map((locale) => {
        const templates = faqTranslationTemplates[locale];
        const values: TemplateValues = {
          municipality: municipalityNames[locale],
          department: department.labels[locale],
          category: category.labels[locale],
          topicTerms: category.labels[locale],
        };
        const items = japanese.items.map((item) => {
          const no = item.no as FaqQuestionNumber;
          return {
            no,
            question: fillTemplate(templates.questions[no], values),
            answer: fillTemplate(answerTemplate(templates, no, item.answer), values),
          };
        });
        return [locale, { items }];
      }),
    );

    const outputPath = join(outputDirectory, `${category.slug}.json`);
    writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          sourceDigest: computeFaqSourceDigest(japanese),
          translations,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}

console.log(
  `Generated ${catalog.departments.length * 5} FAQ translation files for ${faqTranslationLocales.length} locales.`,
);
