import type { Dictionary } from '../i18n/dictionaries';

export type LifeItemId = keyof Dictionary['findInfo']['lifeInfo']['items'];
export type LifeTopicId = keyof Dictionary['contentPages']['lifeTopics'];
export type NewsArticleId = keyof Dictionary['news']['articles'];

export type LifeTopic = {
  id: LifeTopicId;
  slug: string;
  sourceUrl: string;
};

export type LifeCategory = {
  id: LifeItemId;
  slug: string;
  icon: string;
  sourceUrl: string;
  topics: readonly LifeTopic[];
};

export type NewsArticle = {
  id: NewsArticleId;
  slug: string;
  date: string;
  category: 'new' | 'featured';
  image?: string;
  sourceUrl: string;
};

/**
 * 世田谷区公式サイトの分類と代表的な案内を、未来市デモ用の2階層ルートへ対応付ける。
 * 表示文言はすべて dictionaries.ts に置き、このファイルはルート・画像・参照URLだけを持つ。
 */
export const lifeCategories: readonly LifeCategory[] = [
  {
    id: 'trash',
    slug: 'trash-recycling',
    icon: '/life-information/life-trash.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/gomi/11535.html',
    topics: [
      {
        id: 'garbageSorting',
        slug: 'sorting-and-collection',
        sourceUrl: 'https://www.city.setagaya.lg.jp/02241/387.html',
      },
      {
        id: 'bulkyWaste',
        slug: 'bulky-waste',
        sourceUrl: 'https://www.city.setagaya.lg.jp/02241/online_tetsuzuki/380.html',
      },
    ],
  },
  {
    id: 'childEducation',
    slug: 'children-education-youth',
    icon: '/life-information/life-child-education.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/kodomokyouiku/11525.html',
    topics: [
      {
        id: 'pregnancyChildbirth',
        slug: 'pregnancy-and-childbirth',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kodomokyouiku/ninshinshussan/category/11721.html',
      },
      {
        id: 'nurseryKindergarten',
        slug: 'nursery-and-kindergarten',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kodomokyouiku/hoikuen/category/11732.html',
      },
    ],
  },
  {
    id: 'safety',
    slug: 'emergency-safety-disaster',
    icon: '/life-information/life-safety.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/kyuukyuu/11536.html',
    topics: [
      {
        id: 'emergencyCare',
        slug: 'emergency-care',
        sourceUrl: 'https://www.city.setagaya.lg.jp/03662/500.html',
      },
      {
        id: 'disasterPreparedness',
        slug: 'disaster-preparedness',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/kyuukyuu/category/12352.html',
      },
    ],
  },
  {
    id: 'residence',
    slug: 'family-register-residency',
    icon: '/life-information/life-residence.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/kosekijuumin/11531.html',
    topics: [
      {
        id: 'movingNotification',
        slug: 'moving-notification',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/kosekijuumin/category/12307.html',
      },
      {
        id: 'familyRegister',
        slug: 'family-register',
        sourceUrl: 'https://www.city.setagaya.lg.jp/02233/58.html',
      },
    ],
  },
  {
    id: 'facilities',
    slug: 'facilities',
    icon: '/life-information/life-facilities.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/shisetsu/search/index.html',
    topics: [
      {
        id: 'facilitySearch',
        slug: 'facility-search',
        sourceUrl: 'https://www.city.setagaya.lg.jp/shisetsu/search/index.html',
      },
      {
        id: 'accessibleFacilities',
        slug: 'accessible-facilities',
        sourceUrl: 'https://www.city.setagaya.lg.jp/shisetsu/search/index.html',
      },
    ],
  },
  {
    id: 'event',
    slug: 'events-tourism',
    icon: '/life-information/life-event.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/kankou/index.html',
    topics: [
      {
        id: 'eventCalendar',
        slug: 'event-calendar',
        sourceUrl: 'https://www.city.setagaya.lg.jp/cgi-bin/event_cal_multi/calendar.cgi?type=1',
      },
      {
        id: 'tourismGuide',
        slug: 'tourism-guide',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kankou/index.html',
      },
    ],
  },
  {
    id: 'faq',
    slug: 'frequently-asked-questions',
    icon: '/life-information/life-faq.png',
    sourceUrl: '/life/frequently-asked-questions',
    topics: [],
  },
  {
    id: 'feedback',
    slug: 'feedback',
    icon: '/life-information/life-feedback.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02002/25858.html',
    topics: [
      {
        id: 'submitOpinion',
        slug: 'submit-opinion',
        sourceUrl: 'https://www.city.setagaya.lg.jp/02002/7775.html',
      },
      {
        id: 'contactCenter',
        slug: 'contact-center',
        sourceUrl: 'https://www.city.setagaya.lg.jp/02002/25858.html',
      },
    ],
  },
  {
    id: 'welfare',
    slug: 'welfare-health',
    icon: '/life-information/life-welfare.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/fukushikenkou/11526.html',
    topics: [
      {
        id: 'healthCheckups',
        slug: 'health-checkups',
        sourceUrl: 'https://www.city.setagaya.lg.jp/fukushikenkou/kenkouhoken/category/11797.html',
      },
      {
        id: 'seniorCare',
        slug: 'senior-care',
        sourceUrl: 'https://www.city.setagaya.lg.jp/fukushikenkou/koureikaigo/category/11761.html',
      },
    ],
  },
  {
    id: 'educationBoard',
    slug: 'board-of-education',
    icon: '/life-information/life-education-board.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/kyouikuiinkai/index.html',
    topics: [
      {
        id: 'schoolEnrollment',
        slug: 'school-enrollment',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kyouikuiinkai/gakkou/category/11737.html',
      },
      {
        id: 'educationConsultation',
        slug: 'education-consultation',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kyouikuiinkai/index.html',
      },
    ],
  },
  {
    id: 'myNumber',
    slug: 'my-number',
    icon: '/life-information/life-my-number.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/mynumber/11532.html',
    topics: [
      {
        id: 'myNumberApplication',
        slug: 'card-application',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/mynumber/category/32796.html',
      },
      {
        id: 'convenienceCertificates',
        slug: 'convenience-store-certificates',
        sourceUrl: 'https://www.city.setagaya.lg.jp/02233/149.html',
      },
    ],
  },
  {
    id: 'consultation',
    slug: 'consultation-support',
    icon: '/life-information/life-consultation.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/seikatsujouhou/soudan/index.html',
    topics: [
      {
        id: 'dailyLifeConsultation',
        slug: 'daily-life-consultation',
        sourceUrl: 'https://www.city.setagaya.lg.jp/seikatsujouhou/soudan/15725.html',
      },
      {
        id: 'legalConsultation',
        slug: 'legal-consultation',
        sourceUrl: 'https://www.city.setagaya.lg.jp/seikatsujouhou/soudan/15739.html',
      },
    ],
  },
  {
    id: 'tax',
    slug: 'tax-insurance-pension',
    icon: '/life-information/life-tax.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/seikatsujouhou/zeihokennenkin/24453.html',
    topics: [
      {
        id: 'residentTax',
        slug: 'resident-tax',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/zeikin/11533.html',
      },
      {
        id: 'nationalHealthInsurance',
        slug: 'national-health-insurance',
        sourceUrl: 'https://www.city.setagaya.lg.jp/kurashi/hokennenkin/11534.html',
      },
    ],
  },
  {
    id: 'library',
    slug: 'libraries',
    icon: '/life-information/life-library.png',
    sourceUrl: 'https://libweb.city.setagaya.tokyo.jp/',
    topics: [
      {
        id: 'librarySearchReserve',
        slug: 'search-and-reserve',
        sourceUrl: 'https://libweb.city.setagaya.tokyo.jp/menucontents?pid=8',
      },
      {
        id: 'libraryCard',
        slug: 'library-card',
        sourceUrl: 'https://libweb.city.setagaya.tokyo.jp/contents?pid=29',
      },
    ],
  },
  {
    id: 'openData',
    slug: 'open-data',
    icon: '/life-information/life-open-data.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/opendata/index.html',
    topics: [
      {
        id: 'openDataCatalog',
        slug: 'data-catalog',
        sourceUrl: 'https://www.city.setagaya.lg.jp/opendata/index.php',
      },
      {
        id: 'cityStatistics',
        slug: 'city-statistics',
        sourceUrl: 'https://www.city.setagaya.lg.jp/opendata/index.html',
      },
    ],
  },
  {
    id: 'organization',
    slug: 'organization',
    icon: '/life-information/life-organization.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/soshiki/ichiran/category/12695.html',
    topics: [
      {
        id: 'departmentDirectory',
        slug: 'department-directory',
        sourceUrl: 'https://www.city.setagaya.lg.jp/soshiki/ichiran/category/12695.html',
      },
      {
        id: 'departmentResponsibilities',
        slug: 'department-responsibilities',
        sourceUrl: 'https://www.city.setagaya.lg.jp/soshiki/ichiran/category/12695.html',
      },
    ],
  },
  {
    id: 'counter',
    slug: 'service-counters',
    icon: '/life-information/life-counter.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/madoguchi/index.html',
    topics: [
      {
        id: 'counterSearch',
        slug: 'counter-search',
        sourceUrl: 'https://www.city.setagaya.lg.jp/02002/8125.html',
      },
      {
        id: 'holidayCounter',
        slug: 'holiday-counter',
        sourceUrl: 'https://www.city.setagaya.lg.jp/madoguchi/index.html',
      },
    ],
  },
  {
    id: 'housing',
    slug: 'housing-moving',
    icon: '/life-information/life-housing.png',
    sourceUrl: 'https://www.city.setagaya.lg.jp/lifescene/juutaku/index.html',
    topics: [
      {
        id: 'movingGuide',
        slug: 'moving-guide',
        sourceUrl: 'https://www.city.setagaya.lg.jp/lifescene/juutaku/15710.html',
      },
      {
        id: 'housingSupport',
        slug: 'housing-support',
        sourceUrl: 'https://www.city.setagaya.lg.jp/lifescene/juutaku/15708.html',
      },
    ],
  },
] as const;

export const newsArticles: readonly NewsArticle[] = [
  {
    id: 'assembly',
    slug: 'assembly-session-june-2026',
    date: '2026-06-02',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02030/34015.html',
  },
  {
    id: 'construction',
    slug: 'construction-contracts-middle-east',
    date: '2026-06-09',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02234/33560.html',
  },
  {
    id: 'floodBoard',
    slug: 'flood-barrier-subsidy',
    date: '2026-04-02',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/03666/31783.html',
  },
  {
    id: 'aircon',
    slug: 'air-conditioner-purchase-support',
    date: '2026-05-13',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/fukushikenkou/seikatsushien/category/33026.html',
  },
  {
    id: 'floodDamage',
    slug: 'after-flood-damage',
    date: '2026-06-03',
    category: 'featured',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02049/20585.html',
  },
  {
    id: 'myNumberExpress',
    slug: 'my-number-card-express-issuance',
    date: '2026-05-23',
    category: 'featured',
    sourceUrl: 'https://www.city.setagaya.lg.jp/01045/20908.html',
  },
  {
    id: 'minpaku',
    slug: 'private-lodging-policy',
    date: '2026-06-09',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02245/33342.html',
  },
  {
    id: 'measles',
    slug: 'measles-alert',
    date: '2026-04-30',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02015/3137.html',
  },
  {
    id: 'furigana',
    slug: 'resident-record-name-furigana',
    date: '2026-05-26',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02233/33146.html',
  },
  {
    id: 'setayell',
    slug: 'mirayell-youth-support',
    date: '2026-05-25',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/03648/2117.html',
  },
  {
    id: 'childcare',
    slug: 'flexible-childcare-program',
    date: '2026-05-27',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02243/29576.html',
  },
  {
    id: 'solar',
    slug: 'solar-surplus-power-pilot',
    date: '2026-05-27',
    category: 'new',
    sourceUrl: 'https://www.city.setagaya.lg.jp/02240/20206.html',
  },
] as const;

export function getLifeCategory(slug: string) {
  return lifeCategories.find((category) => category.slug === slug);
}

export function getLifeTopic(categorySlug: string, topicSlug: string) {
  const category = getLifeCategory(categorySlug);
  const topic = category?.topics.find((item) => item.slug === topicSlug);

  return category && topic ? { category, topic } : undefined;
}

export function getNewsArticle(slug: string) {
  return newsArticles.find((article) => article.slug === slug);
}
