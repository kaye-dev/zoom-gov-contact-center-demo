/**
 * 業種テナント固有のコンテンツ辞書。
 *
 * 共通クローム（ナビ、テーマ、認証、管理画面など業種非依存の文言）は
 * app/i18n/dictionaries.ts の ChromeDictionary 側が持つ。
 * ここには業種によって内容が変わる表示文言だけを置く。
 */

/**
 * id をキーにした表示文言。id の集合は業種テナントごとに異なるため、
 * 型は開いておき、site-content の id との対応は
 * test/tenant-content.test.ts が全ロケール分を検証する。
 */
export type LocalizedLabels = Record<string, string>;

export type DisasterRadioDictionary = {
  title: string;
  breadcrumb: string;
  lifeBreadcrumb: string;
  safetyBreadcrumb: string;
  contentsHeading: string;
  lead: string;
  emailHeading: string;
  emailDescription: string;
  registrationHeading: string;
  registrationSteps: readonly [string, string, string];
  registrationLink: string;
  registrationAddressLabel: string;
  senderAddressLabel: string;
  emailNote: string;
  phoneHeading: string;
  phoneDescription: string;
  phoneNumberLabel: string;
  demoSuffix: string;
  phoneNote: string;
  contactHeading: string;
  contactNote: string;
  contactPhoneLabel: string;
  form: {
    heading: string;
    description: string;
    name: string;
    email: string;
    emailHelp: string;
    phone: string;
    phoneHelp: string;
    consent: string;
    required: string;
    submit: string;
    submitting: string;
    syncNote: string;
    assignmentNote: string;
    validationTitle: string;
    validationMessage: string;
    nameValidationMessage: string;
    serverErrorTitle: string;
    serverErrorMessage: string;
    successTitle: string;
    successMessage: string;
    registerAnother: string;
  };
};

export type TenantContentDictionary = {
  /** サイト名（例: 未来市 / 未来大学） */
  siteName: string;
  /** サイト名の欧文表記（例: MIRAI CITY） */
  siteNameRoman: string;
  findInfo: {
    lifeInfo: {
      sectionLabel: string;
      items: LocalizedLabels;
    };
  };
  news: {
    articles: LocalizedLabels;
  };
  contentPages: {
    lifeIndexTitle: string;
    lifeIndexLead: string;
    newsIndexLead: string;
    allCategories: string;
    contactNote: string;
    disasterRadio: DisasterRadioDictionary;
    lifeTopics: LocalizedLabels;
    lifeTopicSummaries: LocalizedLabels;
    newsSummaries: LocalizedLabels;
  };
  footer: {
    buildingGuide: string;
    disasterRadio: string;
    postalCode: string;
    address: string;
    tower: string;
    copyright: string;
  };
};
