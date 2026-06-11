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
  news: {
    title: string;
    subtitle: string;
    more: string;
    close: string;
    category: { new: string; featured: string };
    articles: {
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
    news: {
      title: 'お知らせ',
      subtitle: 'Information',
      more: 'もっと見る',
      close: '閉じる',
      category: { new: '新着情報', featured: '注目情報' },
      articles: {
        assembly: '令和8年第2回区議会定例会を6月10日から6月19日まで開催します',
        construction: '中東情勢を踏まえた適正な工事請負契約の確保について（通知）',
        floodBoard: '止水板設置等助成制度のご案内',
        aircon: '低所得世帯および生活保護世帯へのエアコン購入費等助成について',
        floodDamage: '浸水被害にあってしまったら',
        myNumberExpress: 'マイナンバーカードの特急発行について',
        minpaku:
          '特別区長会の有志による「住宅宿泊事業の適正化に関する要望」に対する区の見解',
        measles: '麻しん（はしか）にご注意ください',
        furigana: '住民票に氏名・旧氏の振り仮名が記載されます',
        setayell:
          '児童養護施設や里親等のもとを巣立つ若者などのための相談支援事業「せたエール」',
        childcare: '未来市版こども誰でも通園制度（乳児等通園支援事業）について',
        solar: '【モニター募集中】住宅用太陽光発電の余剰電力を活用した実証事業',
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
    news: {
      title: 'News',
      subtitle: 'Information',
      more: 'See More',
      close: 'Close',
      category: { new: 'Latest News', featured: 'Featured' },
      articles: {
        assembly:
          'The 2nd Regular Session of the FY2026 City Assembly will be held from June 10 to June 19',
        construction:
          'Ensuring Appropriate Construction Contracts in Light of the Middle East Situation (Notice)',
        floodBoard: 'Guide to the Subsidy Program for Installing Flood Barriers',
        aircon:
          'Subsidy for Air Conditioner Purchase Costs for Low-Income and Public Assistance Households',
        floodDamage: 'If You Suffer Flood Damage',
        myNumberExpress: 'About Express Issuance of My Number Cards',
        minpaku:
          "The City's View on the Request for Proper Regulation of Home-Sharing Businesses by Volunteer Ward Mayors",
        measles: 'Please Be Careful of Measles',
        furigana:
          'Phonetic Readings of Names and Former Names to Be Recorded on Residence Certificates',
        setayell:
          '"Setayell": Consultation Support Program for Youth Leaving Child Care Facilities and Foster Homes',
        childcare:
          'About the Mirai City Universal Childcare Access Program (Infant Childcare Support Program)',
        solar:
          '[Monitors Wanted] Demonstration Project Utilizing Surplus Power from Residential Solar Generation',
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
    news: {
      title: '通知公告',
      subtitle: 'Information',
      more: '查看更多',
      close: '收起',
      category: { new: '最新消息', featured: '重点关注' },
      articles: {
        assembly: '令和8年度第2次区议会定例会将于6月10日至6月19日召开',
        construction: '关于在中东局势下确保适当工程承包合同的通知',
        floodBoard: '止水板设置等补助制度的介绍',
        aircon: '面向低收入家庭及生活保护家庭的空调购置费等补助介绍',
        floodDamage: '遭遇浸水灾害时的应对',
        myNumberExpress: '关于个人编号卡的加急发放',
        minpaku: '区对特别区长会有志提出的“关于规范住宅住宿业的要望”的见解',
        measles: '请注意麻疹',
        furigana: '居民票将记载姓名及旧姓的振假名（读音）',
        setayell: '面向从儿童养护设施及寄养家庭独立的青年等的咨询支援事业“Setayell”',
        childcare: '关于未来市版儿童普惠通园制度（婴幼儿通园支援事业）',
        solar: '【征集体验者】利用住宅用太阳能发电余电的实证事业',
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
    news: {
      title: '通知公告',
      subtitle: 'Information',
      more: '查看更多',
      close: '收合',
      category: { new: '最新消息', featured: '重點關注' },
      articles: {
        assembly: '令和8年度第2次區議會定例會將於6月10日至6月19日召開',
        construction: '關於在中東局勢下確保適當工程承包合約的通知',
        floodBoard: '止水板設置等補助制度的介紹',
        aircon: '面向低收入家庭及生活保護家庭的空調購置費等補助介紹',
        floodDamage: '遭遇浸水災害時的應對',
        myNumberExpress: '關於個人編號卡的加急發放',
        minpaku: '區對特別區長會有志提出的「關於規範住宅住宿業的要望」之見解',
        measles: '請注意麻疹',
        furigana: '居民票將記載姓名及舊姓的振假名（讀音）',
        setayell: '面向從兒童養護設施及寄養家庭獨立的青年等的諮詢支援事業「Setayell」',
        childcare: '關於未來市版兒童普惠通園制度（嬰幼兒通園支援事業）',
        solar: '【徵集體驗者】利用住宅用太陽能發電餘電的實證事業',
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
    news: {
      title: '알림',
      subtitle: 'Information',
      more: '더 보기',
      close: '닫기',
      category: { new: '새소식', featured: '주요 정보' },
      articles: {
        assembly: '레이와 8년 제2회 구의회 정례회를 6월 10일부터 6월 19일까지 개최합니다',
        construction: '중동 정세를 고려한 적정한 공사 도급 계약 확보에 관하여(통지)',
        floodBoard: '지수판 설치 등 보조 제도 안내',
        aircon: '저소득 세대 및 생활보호 세대를 위한 에어컨 구입비 등 보조 안내',
        floodDamage: '침수 피해를 입었다면',
        myNumberExpress: '마이넘버 카드 특급 발급에 관하여',
        minpaku: "특별구청장회 유지(有志)의 '주택숙박사업 적정화에 관한 요망'에 대한 구의 견해",
        measles: '홍역(마진)에 주의하세요',
        furigana: '주민표에 성명·구성(旧氏)의 후리가나가 기재됩니다',
        setayell: "아동양호시설이나 위탁가정 등을 떠나는 청년 등을 위한 상담 지원 사업 'Setayell'",
        childcare: '미래시판 어린이 누구나 통원 제도(영유아 등 통원 지원 사업)에 관하여',
        solar: '【모니터 모집 중】주택용 태양광 발전 잉여 전력을 활용한 실증 사업',
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
