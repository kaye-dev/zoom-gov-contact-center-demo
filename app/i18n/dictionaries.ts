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
  findInfo: {
    title: string;
    subtitle: string;
    sectionLabel: string;
    call: { title: string; description: string };
    chat: { title: string; description: string };
    lifeInfo: {
      sectionLabel: string;
      items: {
        trash: string;
        childEducation: string;
        safety: string;
        residence: string;
        facilities: string;
        event: string;
        faq: string;
        feedback: string;
        welfare: string;
        educationBoard: string;
        myNumber: string;
        consultation: string;
        tax: string;
        library: string;
        openData: string;
        organization: string;
        counter: string;
        housing: string;
      };
    };
  };
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
    findInfo: {
      title: '情報を探す',
      subtitle: 'Find information',
      sectionLabel: 'Zoom AI に相談',
      call: {
        title: 'AI 電話相談',
        description:
          '相談内容を AI が一次対応を行い、高度なご相談や個人情報に関わるご相談は有人オペレーターにお繋ぎします。',
      },
      chat: {
        title: 'AI チャット相談',
        description:
          '相談内容を AI がチャット形式でお答えします。高度なご質問や個人情報に関わるご相談は適切な相談先をお繋ぎいたします。',
      },
      lifeInfo: {
        sectionLabel: '生活情報',
        items: {
          trash: 'ごみ・リサイクル',
          childEducation: '子供・教育・若者支援',
          safety: '救急・防犯・防災',
          residence: '戸籍・住民登録',
          facilities: '施設案内',
          event: 'イベント・観光情報',
          faq: 'よくある質問',
          feedback: '区政へのご意見',
          welfare: '福祉・健康',
          educationBoard: '教育委員会',
          myNumber: 'マイナンバー',
          consultation: '相談・悩みごと',
          tax: '税金・保険・年金',
          library: '図書館',
          openData: 'オープンデータ',
          organization: '組織一覧',
          counter: '窓口一覧',
          housing: '住宅・引っ越し',
        },
      },
    },
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
    findInfo: {
      title: 'Find Information',
      subtitle: 'Find information',
      sectionLabel: 'Consult Zoom AI',
      call: {
        title: 'AI Phone Consultation',
        description:
          'AI handles your inquiry first, then connects you to a live operator for complex matters or questions involving personal information.',
      },
      chat: {
        title: 'AI Chat Consultation',
        description:
          'AI answers your inquiry in a chat format. For advanced questions or matters involving personal information, we connect you to the appropriate contact.',
      },
      lifeInfo: {
        sectionLabel: 'Daily Life',
        items: {
          trash: 'Garbage & Recycling',
          childEducation: 'Children, Education & Youth Support',
          safety: 'Emergency, Crime & Disaster Prevention',
          residence: 'Family Register & Residency',
          facilities: 'Facility Guide',
          event: 'Events & Tourism',
          faq: 'FAQ',
          feedback: 'Feedback on City Government',
          welfare: 'Welfare & Health',
          educationBoard: 'Board of Education',
          myNumber: 'My Number',
          consultation: 'Consultation & Concerns',
          tax: 'Tax, Insurance & Pension',
          library: 'Library',
          openData: 'Open Data',
          organization: 'Organization List',
          counter: 'Service Counter List',
          housing: 'Housing & Moving',
        },
      },
    },
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
    findInfo: {
      title: '查找信息',
      subtitle: 'Find information',
      sectionLabel: '咨询 Zoom AI',
      call: {
        title: 'AI 电话咨询',
        description:
          '由 AI 进行首次应答，高级咨询或涉及个人信息的咨询将转接至人工坐席。',
      },
      chat: {
        title: 'AI 聊天咨询',
        description:
          '由 AI 以聊天形式解答咨询内容。对于高级问题或涉及个人信息的咨询，将为您转接至合适的咨询窗口。',
      },
      lifeInfo: {
        sectionLabel: '生活信息',
        items: {
          trash: '垃圾・回收',
          childEducation: '儿童・教育・青少年支援',
          safety: '急救・防范・防灾',
          residence: '户籍・居民登记',
          facilities: '设施指南',
          event: '活动・观光信息',
          faq: '常见问题',
          feedback: '对区政的意见',
          welfare: '福祉・健康',
          educationBoard: '教育委员会',
          myNumber: '个人编号',
          consultation: '咨询・烦恼',
          tax: '税金・保险・年金',
          library: '图书馆',
          openData: '开放数据',
          organization: '组织一览',
          counter: '窗口一览',
          housing: '住宅・搬迁',
        },
      },
    },
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
    findInfo: {
      title: '尋找資訊',
      subtitle: 'Find information',
      sectionLabel: '諮詢 Zoom AI',
      call: {
        title: 'AI 電話諮詢',
        description:
          '由 AI 進行初次應答，高度諮詢或涉及個人資訊的諮詢將轉接至真人客服。',
      },
      chat: {
        title: 'AI 聊天諮詢',
        description:
          '由 AI 以聊天形式回覆諮詢內容。對於高度問題或涉及個人資訊的諮詢，將為您轉接至合適的諮詢窗口。',
      },
      lifeInfo: {
        sectionLabel: '生活資訊',
        items: {
          trash: '垃圾・回收',
          childEducation: '兒童・教育・青少年支援',
          safety: '急救・防範・防災',
          residence: '戶籍・居民登記',
          facilities: '設施導覽',
          event: '活動・觀光資訊',
          faq: '常見問題',
          feedback: '對區政的意見',
          welfare: '福祉・健康',
          educationBoard: '教育委員會',
          myNumber: '個人編號',
          consultation: '諮詢・煩惱',
          tax: '稅金・保險・年金',
          library: '圖書館',
          openData: '開放資料',
          organization: '組織一覽',
          counter: '窗口一覽',
          housing: '住宅・搬遷',
        },
      },
    },
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
    findInfo: {
      title: '정보 찾기',
      subtitle: 'Find information',
      sectionLabel: 'Zoom AI 상담',
      call: {
        title: 'AI 전화 상담',
        description:
          '상담 내용을 AI가 1차 응대하며, 고도의 상담이나 개인정보와 관련된 상담은 상담원에게 연결해 드립니다.',
      },
      chat: {
        title: 'AI 채팅 상담',
        description:
          '상담 내용을 AI가 채팅 형식으로 답변해 드립니다. 고도의 질문이나 개인정보와 관련된 상담은 적절한 상담처로 연결해 드립니다.',
      },
      lifeInfo: {
        sectionLabel: '생활 정보',
        items: {
          trash: '쓰레기・재활용',
          childEducation: '아동・교육・청소년 지원',
          safety: '응급・방범・방재',
          residence: '호적・주민등록',
          facilities: '시설 안내',
          event: '이벤트・관광 정보',
          faq: '자주 묻는 질문',
          feedback: '구정에 대한 의견',
          welfare: '복지・건강',
          educationBoard: '교육위원회',
          myNumber: '마이넘버',
          consultation: '상담・고민거리',
          tax: '세금・보험・연금',
          library: '도서관',
          openData: '오픈 데이터',
          organization: '조직 목록',
          counter: '창구 목록',
          housing: '주택・이사',
        },
      },
    },
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
