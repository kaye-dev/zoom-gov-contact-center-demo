/**
 * 業種テナント固有のコンテンツ辞書。
 *
 * 共通クローム（ナビ、テーマ、認証、管理画面など業種非依存の文言）は
 * app/i18n/dictionaries.ts の ChromeDictionary 側が持つ。
 * ここには業種によって内容が変わる表示文言だけを置く。
 */

export type NewsArticleDictionary = {
  assembly: string;
  construction: string;
  floodBoard: string;
  aircon: string;
  floodDamage: string;
  myNumberExpress: string;
  minpaku: string;
  measles: string;
  furigana: string;
  setayell: string;
  childcare: string;
  solar: string;
};

export type LifeTopicDictionary = {
  garbageSorting: string;
  bulkyWaste: string;
  pregnancyChildbirth: string;
  nurseryKindergarten: string;
  emergencyCare: string;
  disasterPreparedness: string;
  movingNotification: string;
  familyRegister: string;
  facilitySearch: string;
  accessibleFacilities: string;
  eventCalendar: string;
  tourismGuide: string;
  submitOpinion: string;
  contactCenter: string;
  healthCheckups: string;
  seniorCare: string;
  schoolEnrollment: string;
  educationConsultation: string;
  myNumberApplication: string;
  convenienceCertificates: string;
  dailyLifeConsultation: string;
  legalConsultation: string;
  residentTax: string;
  nationalHealthInsurance: string;
  librarySearchReserve: string;
  libraryCard: string;
  openDataCatalog: string;
  cityStatistics: string;
  departmentDirectory: string;
  departmentResponsibilities: string;
  counterSearch: string;
  holidayCounter: string;
  movingGuide: string;
  housingSupport: string;
};

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
      items: Record<string, string>;
    };
  };
  news: {
    articles: NewsArticleDictionary;
  };
  contentPages: {
    lifeIndexTitle: string;
    lifeIndexLead: string;
    newsIndexLead: string;
    allCategories: string;
    contactNote: string;
    disasterRadio: DisasterRadioDictionary;
    lifeTopics: LifeTopicDictionary;
    lifeTopicSummaries: LifeTopicDictionary;
    newsSummaries: NewsArticleDictionary;
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
