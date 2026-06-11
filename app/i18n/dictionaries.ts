// 対応ロケールと UI 文言の辞書。
// ルーティングを使わず、クライアント側で言語を切り替えるシンプルな構成。

export const locales = ['ja', 'en', 'zh-Hans', 'zh-Hant', 'ko'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ja';

export const isLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);

// 言語メニューに表示する各言語の名称（常にその言語自身の表記）
export const localeNames: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ko: '한국어',
};

export type Dictionary = {
  cityName: string;
  cityNameRoman: string;
  nav: {
    access: string;
    congestion: string;
    language: string;
  };
  emergency: string;
  searchMenu: string;
  footer: {
    sitePolicy: string;
    privacy: string;
    buildingGuide: string;
    feedback: string;
    sitemap: string;
    postalCode: string;
    address: string;
    tower: string;
    phoneLabel: string;
    phoneNote: string;
    copyright: string;
  };
};

export const dictionaries: Record<Locale, Dictionary> = {
  ja: {
    cityName: '未来市',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: 'アクセス・施設案内',
      congestion: '窓口混雑状況',
      language: '言語',
    },
    emergency: '緊急情報',
    searchMenu: '検索メニュー',
    footer: {
      sitePolicy: 'サイトポリシー',
      privacy: 'プライバシーポリシー',
      buildingGuide: '庁舎案内',
      feedback: 'ご意見・ご要望',
      sitemap: 'サイトマップ',
      postalCode: '〒100-0001',
      address: '未来県未来市中央1-2-3',
      tower: '未来シティタワー',
      phoneLabel: '電話番号：',
      phoneNote: '（代表）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  en: {
    cityName: 'Mirai City',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: 'Access & Facilities',
      congestion: 'Counter Wait Times',
      language: 'Language',
    },
    emergency: 'Emergency',
    searchMenu: 'Search Menu',
    footer: {
      sitePolicy: 'Site Policy',
      privacy: 'Privacy Policy',
      buildingGuide: 'Building Guide',
      feedback: 'Feedback & Requests',
      sitemap: 'Site Map',
      postalCode: '100-0001',
      address: '1-2-3 Chuo, Mirai City, Mirai Pref.',
      tower: 'Mirai City Tower',
      phoneLabel: 'Phone: ',
      phoneNote: ' (Main)',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  'zh-Hans': {
    cityName: '未来市',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: '交通・设施指南',
      congestion: '窗口拥挤状况',
      language: '语言',
    },
    emergency: '紧急信息',
    searchMenu: '搜索菜单',
    footer: {
      sitePolicy: '网站政策',
      privacy: '隐私政策',
      buildingGuide: '办公楼指南',
      feedback: '意见・要望',
      sitemap: '网站地图',
      postalCode: '〒100-0001',
      address: '未来县未来市中央1-2-3',
      tower: '未来城市大厦',
      phoneLabel: '电话号码：',
      phoneNote: '（总机）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  'zh-Hant': {
    cityName: '未來市',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: '交通・設施導覽',
      congestion: '窗口擁擠狀況',
      language: '語言',
    },
    emergency: '緊急資訊',
    searchMenu: '搜尋選單',
    footer: {
      sitePolicy: '網站政策',
      privacy: '隱私權政策',
      buildingGuide: '辦公大樓導覽',
      feedback: '意見・需求',
      sitemap: '網站地圖',
      postalCode: '〒100-0001',
      address: '未來縣未來市中央1-2-3',
      tower: '未來城市大樓',
      phoneLabel: '電話號碼：',
      phoneNote: '（總機）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  ko: {
    cityName: '미래시',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: '오시는 길・시설 안내',
      congestion: '창구 혼잡 상황',
      language: '언어',
    },
    emergency: '긴급 정보',
    searchMenu: '검색 메뉴',
    footer: {
      sitePolicy: '사이트 정책',
      privacy: '개인정보 보호정책',
      buildingGuide: '청사 안내',
      feedback: '의견・요청',
      sitemap: '사이트맵',
      postalCode: '〒100-0001',
      address: '미래현 미래시 주오 1-2-3',
      tower: '미래 시티 타워',
      phoneLabel: '전화번호：',
      phoneNote: '（대표）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
};
