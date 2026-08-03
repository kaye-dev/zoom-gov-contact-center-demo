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
  procedureFaq: string;
  onlineServiceFaq: string;
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

export type Dictionary = {
  cityName: string;
  cityNameRoman: string;
  nav: {
    access: string;
    language: string;
    openMenu: string;
    closeMenu: string;
  };
  theme: {
    light: string;
    dark: string;
  };
  headerCompact: {
    notFound: string;
    consultAi: string;
  };
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
    articles: NewsArticleDictionary;
  };
  contentPages: {
    breadcrumbLabel: string;
    tableOfContents: string;
    home: string;
    lifeIndexTitle: string;
    lifeIndexLead: string;
    newsIndexTitle: string;
    newsIndexLead: string;
    allCategories: string;
    allNews: string;
    categoryLead: string;
    topicCardLead: string;
    topicLead: string;
    topicsHeading: string;
    overviewHeading: string;
    checkHeading: string;
    checkEligibility: string;
    checkDocuments: string;
    checkHowToUse: string;
    checkEligibilityDescription: string;
    checkDocumentsDescription: string;
    checkHowToUseDescription: string;
    newsScopeHeading: string;
    newsScopeDescription: string;
    newsConfirmationHeading: string;
    newsConfirmationDescription: string;
    newsActionHeading: string;
    newsActionDescription: string;
    contactHeading: string;
    contactNote: string;
    contactPhoneLabel: string;
    backToCategory: string;
    publishedLabel: string;
    readMore: string;
    lifeTopics: LifeTopicDictionary;
    lifeTopicSummaries: LifeTopicDictionary;
    newsSummaries: NewsArticleDictionary;
  };
  footer: {
    terms: string;
    privacy: string;
    buildingGuide: string;
    feedback: string;
    sitemap: string;
    login: string;
    goToAdmin: string;
    postalCode: string;
    address: string;
    tower: string;
    phoneLabel: string;
    phoneNote: string;
    copyright: string;
  };
  docs: {
    viewAsMarkdown: string;
  };
  auth: {
    loginTitle: string;
    loginDescription: string;
    email: string;
    password: string;
    currentPassword: string;
    newPassword: string;
    name: string;
    role: string;
    roleUser: string;
    roleAdmin: string;
    login: string;
    signOut: string;
    forgotPassword: string;
    forgotPasswordTitle: string;
    forgotPasswordDescription: string;
    requestReset: string;
    resetRequestSent: string;
    changePasswordTitle: string;
    changePasswordDescription: string;
    changePassword: string;
    passwordChanged: string;
    temporaryPassword: string;
    temporaryPasswordDescription: string;
    required: string;
    error: string;
  };
  admin: {
    title: string;
    users: string;
    newUser: string;
    passwordResets: string;
    userListTitle: string;
    searchPlaceholder: string;
    search: string;
    clear: string;
    createUserTitle: string;
    createUserDescription: string;
    createUser: string;
    email: string;
    name: string;
    role: string;
    mustChangePassword: string;
    createdAt: string;
    status: string;
    requestedAt: string;
    reviewedAt: string;
    approve: string;
    reject: string;
    pending: string;
    approved: string;
    rejected: string;
    consumed: string;
    noUsers: string;
    noResetRequests: string;
    page: string;
    previous: string;
    next: string;
    issuedPasswordTitle: string;
    issuedPasswordDescription: string;
    adminOnly: string;
    dashboardTitle: string;
    dashboardDescription: string;
  };
};

export const dictionaries: Record<Locale, Dictionary> = {
  ja: {
    cityName: '未来市',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: 'アクセス・施設案内',
      language: '言語',
      openMenu: 'メニューを開く',
      closeMenu: 'メニューを閉じる',
    },
    theme: {
      light: 'ライト',
      dark: 'ダーク',
    },
    headerCompact: {
      notFound: '知りたい情報が見つからないとき',
      consultAi: 'AI オペレーターに相談',
    },
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
          feedback: '市政へのご意見',
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
        assembly: '令和8年第2回未来市議会定例会を6月10日から6月19日まで開催します',
        construction: '中東情勢を踏まえた適正な工事請負契約の確保について（通知）',
        floodBoard: '止水板設置等助成制度のご案内',
        aircon: '低所得世帯および生活保護世帯へのエアコン購入費等助成について',
        floodDamage: '浸水被害にあってしまったら',
        myNumberExpress: 'マイナンバーカードの特急発行について',
        minpaku: '住宅宿泊事業の適正化に関する未来市の見解',
        measles: '麻しん（はしか）にご注意ください',
        furigana: '住民票に氏名・旧氏の振り仮名が記載されます',
        setayell:
          '児童養護施設や里親等のもとを巣立つ若者のための相談支援事業「みらエール」',
        childcare: '未来市版こども誰でも通園制度（乳児等通園支援事業）について',
        solar: '住宅用太陽光発電の余剰電力を活用した実証事業について',
      },
    },
    contentPages: {
      breadcrumbLabel: 'パンくずリスト',
      tableOfContents: '目次',
      home: 'ホーム',
      lifeIndexTitle: '生活情報',
      lifeIndexLead: '暮らしに関する情報を分野別にご案内します。',
      newsIndexTitle: 'お知らせ',
      newsIndexLead: '未来市からの最新情報と注目情報をご案内します。',
      allCategories: '生活情報の全カテゴリ',
      allNews: 'お知らせ一覧',
      categoryLead: '「{name}」に関する主な情報をご案内します。',
      topicCardLead: '「{name}」の概要や手続きのポイントをご案内します。',
      topicLead:
        '「{name}」の概要と、手続き・利用時に確認したいポイントをご案内します。',
      topicsHeading: '主な情報',
      overviewHeading: '概要',
      checkHeading: '確認すること',
      checkEligibility: '対象となる方',
      checkDocuments: '必要なもの',
      checkHowToUse: '利用・手続き方法',
      checkEligibilityDescription:
        '対象年齢、居住要件、受付期間など、案内ごとの条件をご確認ください。条件の記載がない情報は、そのままご利用いただけます。',
      checkDocumentsDescription:
        '申請や予約を伴う場合は、本人確認書類や当日の持ち物など、必要なものを事前にご確認ください。',
      checkHowToUseDescription:
        '掲載内容をご確認のうえ、必要に応じてオンライン、窓口、電話から手続きや相談を行ってください。',
      newsScopeHeading: '対象・影響範囲',
      newsScopeDescription:
        'このお知らせの対象となる方や地域、影響する手続き・サービスをご確認ください。',
      newsConfirmationHeading: '確認事項',
      newsConfirmationDescription:
        '実施時期、条件、注意点など、お知らせの内容に応じて必要な情報をご確認ください。',
      newsActionHeading: '次の行動',
      newsActionDescription:
        '申請、予約、相談、最新状況の確認など、お知らせに記載された案内に沿って対応してください。',
      contactHeading: 'お問い合わせ',
      contactNote:
        '対象となるサービスや手続き方法が分からないときは、未来市お問い合わせセンターへご相談ください。',
      contactPhoneLabel: '電話',
      backToCategory: 'このカテゴリに戻る',
      publishedLabel: '公開日',
      readMore: '詳しく見る',
      lifeTopics: {
        garbageSorting: 'ごみの分別・収集',
        bulkyWaste: '粗大ごみ',
        pregnancyChildbirth: '妊娠・出産',
        nurseryKindergarten: '保育園・幼稚園',
        emergencyCare: '救急医療',
        disasterPreparedness: '防災への備え',
        movingNotification: '転入・転出・転居の届出',
        familyRegister: '戸籍の届出',
        facilitySearch: '施設を探す',
        accessibleFacilities: 'バリアフリー対応施設',
        eventCalendar: 'イベントカレンダー',
        tourismGuide: '観光案内',
        procedureFaq: '手続きに関するよくある質問',
        onlineServiceFaq: 'オンライン手続きに関するよくある質問',
        submitOpinion: '市政へのご意見・ご要望',
        contactCenter: 'お問い合わせセンター',
        healthCheckups: '健診・検診',
        seniorCare: '高齢者・介護',
        schoolEnrollment: '入学・転校',
        educationConsultation: '教育相談',
        myNumberApplication: 'マイナンバーカードの申請',
        convenienceCertificates: 'コンビニ交付',
        dailyLifeConsultation: '暮らしの相談',
        legalConsultation: '法律相談',
        residentTax: '住民税',
        nationalHealthInsurance: '国民健康保険',
        librarySearchReserve: '蔵書検索・予約',
        libraryCard: '図書館利用カード',
        openDataCatalog: 'オープンデータカタログ',
        cityStatistics: '市の統計',
        departmentDirectory: '組織・部署一覧',
        departmentResponsibilities: '各部署の業務案内',
        counterSearch: '窓口を探す',
        holidayCounter: '休日窓口',
        movingGuide: '引っ越し手続き',
        housingSupport: '住宅支援',
      },
      lifeTopicSummaries: {
        garbageSorting:
          '未来市では、家庭ごみを種類ごとに分け、地域別の収集日に回収します。分別方法と集積所は収集カレンダーで確認できます。',
        bulkyWaste:
          '家庭から出る大型の家具や家庭用品は、粗大ごみとして事前申込みが必要です。品目と大きさを確認し、指定された収集方法で出してください。',
        pregnancyChildbirth:
          '妊娠の届出から出産後まで、母子健康手帳の交付、健康相談、家庭訪問などの支援を行います。体調や子育ての不安は早めにご相談ください。',
        nurseryKindergarten:
          '市内の保育園・幼稚園の特徴、申込みから入園までの流れを案内します。希望施設の見学可否と必要書類も事前にご確認ください。',
        emergencyCare:
          '夜間や休日に受診できる医療機関と、急な症状の相談先を案内します。生命に関わる症状の場合は、ただちに救急要請を行ってください。',
        disasterPreparedness:
          'ハザードマップ、避難所、家庭での備蓄品を案内します。家族の連絡方法と避難経路を普段から確認してください。',
        movingNotification:
          '未来市への転入、市外への転出、市内の転居に必要な届出を案内します。住所を変更した方は、所定の期間内に手続きしてください。',
        familyRegister:
          '出生、婚姻、離婚、死亡などの戸籍届出を案内します。届出の種類によって期間や必要書類が異なるため、事前にご確認ください。',
        facilitySearch:
          '市役所、地域センター、文化・スポーツ施設を目的や地域から探せます。開庁日、交通アクセス、利用できる設備も確認できます。',
        accessibleFacilities:
          '車いす対応トイレ、エレベーター、車いす用駐車場などを備えた市の施設を紹介します。必要な支援がある場合は、利用前に各施設へご相談ください。',
        eventCalendar:
          '未来市で開催する文化、スポーツ、子育てなどのイベントを日付や分野から探せます。予約の要否と参加条件は各イベントの案内をご確認ください。',
        tourismGuide:
          '市内の公園、文化施設、商店街などの見どころと周遊情報を紹介します。季節のイベントや交通手段を組み合わせて、未来市の観光をお楽しみください。',
        procedureFaq:
          '引っ越し、証明書、子育てなど、市の手続きに関するよくある質問をまとめています。回答から必要な手続きの案内へ進めます。',
        onlineServiceFaq:
          'オンライン手続きのログイン、電子署名、ファイル添付、進捗確認に関する質問を案内します。操作に困ったときの対処方法も確認できます。',
        submitOpinion:
          '未来市の施策やサービスに対するご意見・ご要望をオンラインまたは郵送で受け付けます。回答を希望する場合は、連絡先をお知らせください。',
        contactCenter:
          '未来市お問い合わせセンターが、市のサービスに関する一般的な質問にお答えし、担当部署を案内します。手続き名が分からない場合でもご相談ください。',
        healthCheckups:
          '年齢やライフステージに応じた健康診査と各種検診を案内します。受診時期、予約方法、当日持参するものをご確認ください。',
        seniorCare:
          '介護予防、介護保険、在宅生活の支援など、高齢の方とご家族向けのサービスを案内します。心身の状況に合う支援は、地域の相談窓口で一緒に検討できます。',
        schoolEnrollment:
          '小・中学校の入学と転校に必要な手続き、通学区域を案内します。就学に配慮が必要な場合は、早めに教育委員会へご相談ください。',
        educationConsultation:
          '学習、発達、不登校、いじめなど、子どもの教育に関する相談を受け付けます。保護者と子どもの気持ちを聞き、必要な支援機関と連携します。',
        myNumberApplication:
          'マイナンバーカードの申請から受取りまでの流れを案内します。顔写真、本人確認書類、受取り窓口の予約の要否をご確認ください。',
        convenienceCertificates:
          'マイナンバーカードを使い、対応するコンビニ店舗で住民票などの証明書を取得できます。取得できる証明書と利用可能時間を事前にご確認ください。',
        dailyLifeConsultation:
          '生活費、仕事、住まい、家族の問題など、暮らしの困りごとを相談できます。専門の相談員が状況を整理し、利用できる支援や窓口を一緒に探します。',
        legalConsultation:
          '相続、契約、金銭、近隣関係など、日常生活の法律問題を弁護士に相談できます。原則として予約制のため、相談時間と持参資料をご確認ください。',
        residentTax:
          '市民税の計算、申告、納付、課税証明書に関する情報を案内します。収入や住所に変更があったときは、必要な手続きをご確認ください。',
        nationalHealthInsurance:
          '国民健康保険の加入・脱退、保険料、給付の手続きを案内します。就職、退職、引っ越しなどで加入状況が変わる場合は届出が必要です。',
        librarySearchReserve:
          '未来市立図書館の蔵書を検索し、貸出中の資料を予約できます。ログインすると、受取館の指定や貸出延長の手続きも利用できます。',
        libraryCard:
          '図書館利用カードは、市内在住・在勤・在学などの条件を満たす方に発行します。本人確認書類を用意し、図書館窓口で手続きしてください。',
        openDataCatalog:
          '未来市が公開する統計、施設、環境などのデータを分野や形式から検索できます。利用条件と更新日を確認し、出典を明記してご活用ください。',
        cityStatistics:
          '未来市の人口、世帯、産業、財政などの統計をダッシュボードと報告書で公開しています。数値の基準日と用語の定義を確認してご利用ください。',
        departmentDirectory:
          '未来市の組織図と各部署の連絡先、所在地を案内します。部署名のほか、手続きや相談の目的からも探せます。',
        departmentResponsibilities:
          '各部署が担当する施策、手続き、施設管理などの業務を紹介します。相談内容に応じた担当部署の確認にご利用ください。',
        counterSearch:
          '必要な手続きから、対応する窓口の場所、受付時間、予約の要否を探せます。バリアフリー設備やアクセス情報も確認できます。',
        holidayCounter:
          '指定された休日に、一部の証明書交付や住所変更の届出を受け付けます。取り扱えない手続きもあるため、来庁前に対象業務をご確認ください。',
        movingGuide:
          '転入・転出に伴う住民登録、保険、子育て、ライフラインの手続きを一覧で案内します。世帯の状況に合わせて、引っ越し前後のチェックリストを作成できます。',
        housingSupport:
          '公的住宅、家賃負担の軽減、住宅改修、住まいの相談に関する制度を案内します。対象要件は制度ごとに異なるため、世帯状況に合う支援をご確認ください。',
      },
      newsSummaries: {
        assembly:
          '令和8年第2回未来市議会定例会の会期、本会議、委員会の予定を案内します。議案と傍聴方法も会期案内から確認できます。',
        construction:
          '中東情勢による資材価格や物流への影響を踏まえ、未来市が発注する工事の契約に関する考え方を示します。受注者との協議や契約条件の確認方法を案内します。',
        floodBoard:
          '建物への浸水を防ぐ止水板の設置工事や簡易型止水板の購入を支援する制度です。工事や購入の前に、対象となる建物と申請手順をご確認ください。',
        aircon:
          '低所得世帯や生活保護世帯を対象に、熱中症予防のためのエアコン購入・設置を支援します。購入前の申請が必要な場合があるため、対象要件と手順をご確認ください。',
        floodDamage:
          '浸水被害を受けた方向けに、排水、災害ごみの処理、消毒、罹災証明の相談窓口を案内します。安全を確保した上で被害状況を記録し、必要な支援へご相談ください。',
        myNumberExpress:
          '乳児、カード紛失後の再交付など、一定の事由がある方向けの特急発行を案内します。対象事由によって申請窓口と必要書類が異なります。',
        minpaku:
          '未来市は、住宅宿泊事業と地域の生活環境が両立するための考え方をまとめました。事業者の適正な管理と、近隣の方からの相談への対応方針を示します。',
        measles:
          '麻しんの症状、感染を広げないための受診方法、予防接種について案内します。感染が疑われる場合は、受診前に医療機関へ連絡してください。',
        furigana:
          '住民票の氏名・旧氏に振り仮名が記載される制度と、市から届く通知の確認方法を案内します。記載予定の振り仮名が異なる場合は届出が必要です。',
        setayell:
          '「みらエール」は、児童養護施設や里親家庭などから自立する若者の生活、住まい、就労を支える未来市の相談支援事業です。継続的な相談と必要な支援機関への同行を行います。',
        childcare:
          '未来市版こども誰でも通園制度は、保育所等を利用していない乳幼児が、保護者の就労状況にかかわらず施設を利用できる仕組みです。子どもの年齢や利用希望に応じて実施施設を選びます。',
        solar:
          '住宅用太陽光発電の余剰電力を地域で活用する実証事業の目的と仕組みを紹介します。参加機会がある場合は、対象設備やデータ取得の内容とともに案内します。',
      },
    },
    footer: {
      terms: '利用規約',
      privacy: 'プライバシーポリシー',
      buildingGuide: '庁舎案内',
      feedback: 'ご意見・ご要望',
      sitemap: 'サイトマップ',
      login: 'ログイン',
      goToAdmin: '管理画面',
      postalCode: '〒100-0001',
      address: '未来県未来市中央1-2-3',
      tower: '未来シティタワー',
      phoneLabel: '電話番号：',
      phoneNote: '（代表）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
    docs: {
      viewAsMarkdown: 'Markdown 版を表示',
    },
    auth: {
      loginTitle: '管理ログイン',
      loginDescription:
        '記事作成や電話番号変更など、デモ運用者向けの管理機能にアクセスします。',
      email: 'メールアドレス',
      password: 'パスワード',
      currentPassword: '現在のパスワード',
      newPassword: '新しいパスワード',
      name: '氏名',
      role: '権限',
      roleUser: '一般ユーザー',
      roleAdmin: '管理者',
      login: 'ログイン',
      signOut: 'ログアウト',
      forgotPassword: 'パスワード再設定を申請',
      forgotPasswordTitle: 'パスワード再設定申請',
      forgotPasswordDescription:
        '管理者が申請を確認し、新しい仮パスワードを発行します。',
      requestReset: '再設定を申請',
      resetRequestSent:
        '申請を受け付けました。管理者からの案内をお待ちください。',
      changePasswordTitle: 'パスワード変更',
      changePasswordDescription:
        '仮パスワードでログインした場合は、続行前に新しいパスワードへ変更してください。',
      changePassword: 'パスワードを変更',
      passwordChanged: 'パスワードを変更しました。',
      temporaryPassword: '仮パスワード',
      temporaryPasswordDescription:
        'この仮パスワードは一度だけ表示されます。安全な方法で対象ユーザーに共有してください。',
      required: '必須',
      error: '処理に失敗しました。',
    },
    admin: {
      title: '管理画面',
      users: 'ユーザー管理',
      newUser: 'ユーザー作成',
      passwordResets: '再設定申請',
      userListTitle: 'ユーザー管理',
      searchPlaceholder: '氏名またはメールアドレスで検索',
      search: '検索',
      clear: 'クリア',
      createUserTitle: '管理者によるユーザー作成',
      createUserDescription:
        '初回ログイン用の仮パスワードを発行し、初回ログイン後に変更を強制します。',
      createUser: 'ユーザーを作成',
      email: 'メールアドレス',
      name: '氏名',
      role: '権限',
      mustChangePassword: '要パスワード変更',
      createdAt: '作成日時',
      status: '状態',
      requestedAt: '申請日時',
      reviewedAt: '確認日時',
      approve: '承認',
      reject: '却下',
      pending: '未対応',
      approved: '承認済み',
      rejected: '却下済み',
      consumed: '変更済み',
      noUsers: '該当するユーザーはいません。',
      noResetRequests: 'パスワード再設定申請はありません。',
      page: 'ページ',
      previous: '前へ',
      next: '次へ',
      issuedPasswordTitle: '仮パスワードを発行しました',
      issuedPasswordDescription:
        'この画面を閉じると再表示できません。共有後はユーザーにログインと変更を依頼してください。',
      adminOnly: '管理者のみアクセスできます。',
      dashboardTitle: '管理画面',
      dashboardDescription:
        'ログイン済みです。ユーザー管理機能を利用するには管理者権限が必要です。',
    },
  },
  en: {
    cityName: 'Mirai City',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: 'Access & Facilities',
      language: 'Language',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
    },
    headerCompact: {
      notFound: "Can't find what you need?",
      consultAi: 'Consult an AI Operator',
    },
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
          feedback: 'Feedback on Mirai City Government',
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
          'The 2nd Regular Session of the FY2026 Mirai City Council will be held from June 10 to June 19',
        construction:
          'Ensuring Appropriate Construction Contracts in Light of the Middle East Situation (Notice)',
        floodBoard: 'Guide to the Subsidy Program for Installing Flood Barriers',
        aircon:
          'Subsidy for Air Conditioner Purchase Costs for Low-Income and Public Assistance Households',
        floodDamage: 'If You Suffer Flood Damage',
        myNumberExpress: 'About Express Issuance of My Number Cards',
        minpaku:
          "Mirai City's Position on the Appropriate Operation of Private Lodging Businesses",
        measles: 'Please Be Careful of Measles',
        furigana:
          'Phonetic Readings of Names and Former Names to Be Recorded on Residence Certificates',
        setayell:
          '"Mira-Yell": Consultation Support for Young People Leaving Residential or Foster Care',
        childcare:
          'About the Mirai City Universal Childcare Access Program (Infant Childcare Support Program)',
        solar:
          'Demonstration Project Using Surplus Electricity from Residential Solar Power Systems',
      },
    },
    contentPages: {
      breadcrumbLabel: 'Breadcrumb',
      tableOfContents: 'On this page',
      home: 'Home',
      lifeIndexTitle: 'Daily Life',
      lifeIndexLead: 'Browse information about everyday life by category.',
      newsIndexTitle: 'News',
      newsIndexLead:
        'See the latest news and featured information from Mirai City.',
      allCategories: 'All Daily Life Categories',
      allNews: 'All News',
      categoryLead: 'Find key information about {name}.',
      topicCardLead: 'Learn about {name}, including key procedure details.',
      topicLead: 'Learn about {name}, including key points and procedures.',
      topicsHeading: 'Topics',
      overviewHeading: 'Overview',
      checkHeading: 'What to Check',
      checkEligibility: 'Eligibility',
      checkDocuments: 'Required Documents',
      checkHowToUse: 'How to Apply or Use the Service',
      checkEligibilityDescription:
        'Check any conditions stated in the guidance, such as eligible ages, residency requirements, and application periods. Information with no stated conditions is available as presented.',
      checkDocumentsDescription:
        'When an application or reservation is required, check in advance for any proof of identity, items to bring, or other required materials.',
      checkHowToUseDescription:
        'Review the information, then complete any necessary procedure or consultation online, at a service counter, or by phone.',
      newsScopeHeading: 'Scope & Impact',
      newsScopeDescription:
        'Check who and which areas the notice applies to, along with any procedures or services it may affect.',
      newsConfirmationHeading: 'What to Confirm',
      newsConfirmationDescription:
        'Review the relevant dates, conditions, and precautions described in the notice.',
      newsActionHeading: 'Next Steps',
      newsActionDescription:
        'Follow the notice to apply, make a reservation, seek advice, or check for updates as appropriate.',
      contactHeading: 'Contact Us',
      contactNote:
        'If you are unsure which service applies or need help with a procedure, contact the Mirai City Contact Center.',
      contactPhoneLabel: 'Phone',
      backToCategory: 'Back to this category',
      publishedLabel: 'Published',
      readMore: 'Read more',
      lifeTopics: {
        garbageSorting: 'Garbage Sorting & Collection',
        bulkyWaste: 'Bulky Waste',
        pregnancyChildbirth: 'Pregnancy & Childbirth',
        nurseryKindergarten: 'Nursery Schools & Kindergartens',
        emergencyCare: 'Emergency Medical Care',
        disasterPreparedness: 'Disaster Preparedness',
        movingNotification: 'Moving Notifications',
        familyRegister: 'Family Register Notifications',
        facilitySearch: 'Find a Facility',
        accessibleFacilities: 'Accessible Facilities',
        eventCalendar: 'Event Calendar',
        tourismGuide: 'Tourism Guide',
        procedureFaq: 'Frequently Asked Questions About Procedures',
        onlineServiceFaq: 'Frequently Asked Questions About Online Services',
        submitOpinion: 'Feedback and Requests for Mirai City Government',
        contactCenter: 'City Contact Center',
        healthCheckups: 'Health Checkups & Screenings',
        seniorCare: 'Senior Care & Long-Term Care',
        schoolEnrollment: 'School Enrollment & Transfers',
        educationConsultation: 'Education Consultation',
        myNumberApplication: 'Apply for a My Number Card',
        convenienceCertificates: 'Certificate Issuance at Convenience Stores',
        dailyLifeConsultation: 'Daily Life Consultation',
        legalConsultation: 'Legal Consultation',
        residentTax: 'Resident Tax',
        nationalHealthInsurance: 'National Health Insurance',
        librarySearchReserve: 'Search & Reserve Library Materials',
        libraryCard: 'Library Card',
        openDataCatalog: 'Open Data Catalog',
        cityStatistics: 'City Statistics',
        departmentDirectory: 'Department Directory',
        departmentResponsibilities: 'Department Responsibilities',
        counterSearch: 'Find a Service Counter',
        holidayCounter: 'Holiday Service Counters',
        movingGuide: 'Moving Guide',
        housingSupport: 'Housing Support',
      },
      lifeTopicSummaries: {
        garbageSorting:
          'Mirai City collects household waste on neighborhood-specific days after it is sorted by material. Use the collection calendar to check sorting rules, pickup dates, and your designated collection point.',
        bulkyWaste:
          'Large furniture and household items that cannot be collected with regular waste require an advance bulky-waste request. Confirm the item and its dimensions before following the assigned drop-off or collection instructions.',
        pregnancyChildbirth:
          'Support is available from pregnancy notification through the postnatal period, including maternal and child health handbooks, health consultations, and home visits. Contact the city early if you have concerns about your health or caring for your baby.',
        nurseryKindergarten:
          'Compare the features of nurseries and kindergartens in Mirai City and review the steps from application to enrollment. Check whether visits are available and which documents each facility requires before applying.',
        emergencyCare:
          'Find medical providers available at night or on holidays and services that can help assess sudden symptoms. For symptoms that may be life-threatening, call emergency services immediately.',
        disasterPreparedness:
          'Review hazard maps, evacuation shelters, and recommended household supplies for Mirai City. Discuss family contact methods and evacuation routes before an emergency occurs.',
        movingNotification:
          'This guide covers notifications for moving into Mirai City, moving out, or changing address within the city. Submit the applicable address notification within the prescribed period after your move.',
        familyRegister:
          'Find guidance for family register notifications involving births, marriages, divorces, deaths, and other life events. Deadlines and required documents vary by notification, so review them before visiting a counter.',
        facilitySearch:
          'Search city offices, community centers, and cultural or sports facilities by purpose or area. Each listing includes opening days, transportation access, and available amenities.',
        accessibleFacilities:
          'Find city facilities with features such as wheelchair-accessible restrooms, elevators, and accessible parking. Contact the facility before your visit if you need additional assistance.',
        eventCalendar:
          'Browse cultural, sports, and family events in Mirai City by date or category. Each listing shows whether registration is required and any participation conditions.',
        tourismGuide:
          'Explore parks, cultural venues, shopping streets, and suggested routes around Mirai City. Combine seasonal events with local transportation information to plan your visit.',
        procedureFaq:
          'Find answers to common questions about moving, certificates, child-rearing, and other city procedures. Each answer links you to the relevant steps and service information.',
        onlineServiceFaq:
          'Get help with signing in, electronic signatures, file uploads, and tracking online applications. Troubleshooting guidance is also available for common errors and interrupted submissions.',
        submitOpinion:
          'Mirai City accepts feedback and requests about city policies and services online or by post. Include your contact details if you would like an individual response.',
        contactCenter:
          'The Mirai City Contact Center answers general questions about city services and directs you to the responsible department. You can ask for help even if you do not know the name of the procedure you need.',
        healthCheckups:
          'Find health checkups and screenings offered for different ages and life stages. Review the service period, reservation method, and items to bring before your appointment.',
        seniorCare:
          'Services include preventive care, long-term care insurance, and support for living at home for older residents and their families. A local consultation desk can help identify support suited to the person\'s needs.',
        schoolEnrollment:
          'Review the procedures and school attendance areas for starting or transferring to a municipal elementary or junior high school. Contact the Board of Education early if a child needs accommodations for enrollment.',
        educationConsultation:
          'Consultation is available for concerns about learning, development, school attendance, bullying, and other educational matters. Counselors listen to children and guardians and coordinate with appropriate support services when needed.',
        myNumberApplication:
          'Review the process from applying for a My Number Card through collection. Check the photo and identity-document requirements and whether an appointment is needed for pickup.',
        convenienceCertificates:
          'Use a My Number Card to obtain eligible certificates, including residence certificates, at participating convenience stores. Check which certificates are available and the service hours before using a kiosk.',
        dailyLifeConsultation:
          'Speak with a counselor about financial hardship, employment, housing, family concerns, and other challenges in daily life. The counselor will organize your needs and connect you with relevant support or specialist services.',
        legalConsultation:
          'Residents can consult a lawyer about inheritance, contracts, financial disputes, neighborhood issues, and other everyday legal matters. Sessions generally require a reservation, so check the consultation length and documents to bring.',
        residentTax:
          'Find information about municipal resident tax calculations, declarations, payments, and taxation certificates. If your income or address changes, review whether an additional procedure is required.',
        nationalHealthInsurance:
          'This guide covers joining or leaving National Health Insurance, premiums, and benefit applications. A notification may be required when employment, retirement, or a move changes your insurance status.',
        librarySearchReserve:
          'Search the Mirai City Library collection and reserve materials that are currently checked out. Signed-in users can choose a pickup library and request eligible loan renewals.',
        libraryCard:
          'Library cards are available to people who meet residence, employment, school attendance, or other eligibility requirements. Bring proof of identity to a library counter to complete registration.',
        openDataCatalog:
          'Search datasets published by Mirai City, including statistics, facilities, and environmental information, by subject or file format. Check the license and update date, and cite the source when reusing data.',
        cityStatistics:
          'Mirai City publishes population, household, industry, finance, and other statistics through dashboards and reports. Check each figure\'s reference date and definitions before using it.',
        departmentDirectory:
          'View the Mirai City organization chart together with department contact details and office locations. You can search by department name or by the purpose of your procedure or inquiry.',
        departmentResponsibilities:
          'Review the policies, procedures, and facility-management duties assigned to each city department. Use the descriptions to identify the department responsible for your inquiry.',
        counterSearch:
          'Search for the correct service counter by procedure and see its location, hours, and reservation requirements. Listings also include accessibility and transportation information.',
        holidayCounter:
          'Selected counters accept certain certificate requests and address notifications on designated holidays. Because not every procedure is available, confirm the services offered before visiting.',
        movingGuide:
          'See address registration, insurance, child-rearing, utility, and other tasks associated with moving into or out of Mirai City. Build a before-and-after checklist based on your household circumstances.',
        housingSupport:
          'Explore public housing, rent assistance, home modification, and housing consultation programs. Eligibility differs by program, so compare the options with your household circumstances.',
      },
      newsSummaries: {
        assembly:
          'The schedule for the second regular session of the FY2026 Mirai City Council includes plenary meetings and committee sessions. The session guide also explains the bills under consideration and how to observe proceedings.',
        construction:
          'This notice explains Mirai City\'s approach to construction contracts affected by material prices and logistics linked to developments in the Middle East. It covers discussions with contractors and how contract conditions will be reviewed.',
        floodBoard:
          'This program supports the installation of flood barriers and the purchase of portable barriers that help protect buildings from inundation. Confirm the eligible property types and application steps before starting work or making a purchase.',
        aircon:
          'Mirai City supports air-conditioner purchase and installation for eligible low-income and public-assistance households to reduce heat-related health risks. Some applicants must receive approval before purchase, so review eligibility and the application sequence first.',
        floodDamage:
          'Residents affected by flooding can find contacts for drainage, disaster-waste disposal, disinfection, and disaster damage certificates. After ensuring safety, document the damage and contact the service appropriate to your situation.',
        myNumberExpress:
          'Express issuance is available in qualifying circumstances, including applications for infants and reissuance after a lost card. The application counter and required documents depend on the reason for requesting express service.',
        minpaku:
          'Mirai City has set out its position on balancing private lodging operations with a safe and comfortable neighborhood environment. The policy addresses responsible property management and how concerns from nearby residents should be handled.',
        measles:
          'This notice explains measles symptoms, how to seek care without exposing others, and vaccination. If you suspect an infection, contact a medical provider before visiting in person.',
        furigana:
          'Phonetic readings of names and former surnames will be recorded on residence certificates, and Mirai City will send residents a notice showing the planned reading. Submit a notification if the reading in the notice is incorrect.',
        setayell:
          'Mira-Yell is a Mirai City consultation program supporting young people transitioning from residential care, foster care, or similar settings. It offers ongoing help with daily life, housing, employment, and connections to specialist services.',
        childcare:
          'The Mirai City Universal Childcare Access Program lets eligible young children who are not enrolled in nursery care use participating facilities regardless of parental employment status. Families select a facility based on the child\'s age and their preferred pattern of use.',
        solar:
          'This demonstration project explores how surplus electricity from residential solar power systems can be used within the community. When participation opportunities are available, details will include eligible equipment and the data collected during the project.',
      },
    },
    footer: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
      buildingGuide: 'Building Guide',
      feedback: 'Feedback & Requests',
      sitemap: 'Site Map',
      login: 'Log in',
      goToAdmin: 'Admin',
      postalCode: '100-0001',
      address: '1-2-3 Chuo, Mirai City, Mirai Pref.',
      tower: 'Mirai City Tower',
      phoneLabel: 'Phone: ',
      phoneNote: ' (Main)',
      copyright: '© Mirai City. All Rights Reserved.',
    },
    docs: {
      viewAsMarkdown: 'View as Markdown',
    },
    auth: {
      loginTitle: 'Admin Login',
      loginDescription:
        'Access demo-operator features such as article editing and phone number updates.',
      email: 'Email address',
      password: 'Password',
      currentPassword: 'Current password',
      newPassword: 'New password',
      name: 'Name',
      role: 'Role',
      roleUser: 'User',
      roleAdmin: 'Admin',
      login: 'Log in',
      signOut: 'Log out',
      forgotPassword: 'Request password reset',
      forgotPasswordTitle: 'Password Reset Request',
      forgotPasswordDescription:
        'An administrator will review the request and issue a new temporary password.',
      requestReset: 'Request reset',
      resetRequestSent:
        'Your request has been received. Please wait for administrator guidance.',
      changePasswordTitle: 'Change Password',
      changePasswordDescription:
        'If you logged in with a temporary password, change it before continuing.',
      changePassword: 'Change password',
      passwordChanged: 'Your password has been changed.',
      temporaryPassword: 'Temporary password',
      temporaryPasswordDescription:
        'This temporary password is shown only once. Share it with the user through a secure channel.',
      required: 'Required',
      error: 'The request failed.',
    },
    admin: {
      title: 'Admin',
      users: 'User Management',
      newUser: 'Create User',
      passwordResets: 'Reset Requests',
      userListTitle: 'User Management',
      searchPlaceholder: 'Search by name or email',
      search: 'Search',
      clear: 'Clear',
      createUserTitle: 'Create User',
      createUserDescription:
        'Issue a temporary password and require the user to change it after first login.',
      createUser: 'Create user',
      email: 'Email',
      name: 'Name',
      role: 'Role',
      mustChangePassword: 'Must change password',
      createdAt: 'Created at',
      status: 'Status',
      requestedAt: 'Requested at',
      reviewedAt: 'Reviewed at',
      approve: 'Approve',
      reject: 'Reject',
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      consumed: 'Changed',
      noUsers: 'No matching users.',
      noResetRequests: 'No password reset requests.',
      page: 'Page',
      previous: 'Previous',
      next: 'Next',
      issuedPasswordTitle: 'Temporary Password Issued',
      issuedPasswordDescription:
        'It cannot be shown again after this view closes. Ask the user to log in and change it.',
      adminOnly: 'Administrators only.',
      dashboardTitle: 'Admin',
      dashboardDescription:
        'You are signed in. Administrator features require the admin role.',
    },
  },
  'zh-Hans': {
    cityName: '未来市',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: '交通・设施指南',
      language: '语言',
      openMenu: '打开菜单',
      closeMenu: '关闭菜单',
    },
    theme: {
      light: '浅色',
      dark: '深色',
    },
    headerCompact: {
      notFound: '找不到想要的信息时',
      consultAi: '咨询 AI 接线员',
    },
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
          feedback: '对未来市市政的意见',
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
        assembly: '令和8年第2次未来市议会例会将于6月10日至6月19日召开',
        construction: '关于在中东局势下确保适当工程承包合同的通知',
        floodBoard: '止水板设置等补助制度的介绍',
        aircon: '面向低收入家庭及生活保护家庭的空调购置费等补助介绍',
        floodDamage: '遭遇浸水灾害时的应对',
        myNumberExpress: '关于个人编号卡的加急发放',
        minpaku: '未来市关于规范住宅住宿业的见解',
        measles: '请注意麻疹',
        furigana: '居民票将记载姓名及旧姓的振假名（读音）',
        setayell:
          '面向离开儿童养护设施或寄养家庭青年的咨询支援项目“未来援（Mira-Yell）”',
        childcare: '关于未来市版儿童普惠通园制度（婴幼儿通园支援事业）',
        solar: '关于利用住宅太阳能发电余电的实证项目',
      },
    },
    contentPages: {
      breadcrumbLabel: '面包屑导航',
      tableOfContents: '本页目录',
      home: '首页',
      lifeIndexTitle: '生活信息',
      lifeIndexLead: '请按类别查找与日常生活有关的办事和服务。',
      newsIndexTitle: '通知公告',
      newsIndexLead: '汇总未来市发布的最新消息和重点信息。',
      allCategories: '查看所有生活信息分类',
      allNews: '查看所有通知公告',
      categoryLead:
        '本页汇总与“{name}”有关的主要办事和服务。请选择您想了解的项目。',
      topicCardLead: '查看“{name}”的概要和办理要点。',
      topicLead: '本页介绍“{name}”的概要、需要确认的事项和使用方法。',
      topicsHeading: '主要办事与服务',
      overviewHeading: '概要',
      checkHeading: '请先确认',
      checkEligibility: '适用对象',
      checkDocuments: '所需材料',
      checkHowToUse: '办理或使用方法',
      checkEligibilityDescription:
        '请确认各项指南中列明的适用年龄、居住条件和受理期间等条件。未列明条件的信息可直接使用。',
      checkDocumentsDescription:
        '如需申请或预约，请事先确认本人身份证明、当天需携带的物品等必要材料。',
      checkHowToUseDescription:
        '请确认页面内容，并根据需要通过在线、办事窗口或电话办理手续或进行咨询。',
      newsScopeHeading: '适用对象与影响范围',
      newsScopeDescription:
        '请确认本通知适用的人员和地区，以及可能受影响的手续或服务。',
      newsConfirmationHeading: '确认事项',
      newsConfirmationDescription:
        '请根据通知内容确认实施时间、条件和注意事项等必要信息。',
      newsActionHeading: '下一步',
      newsActionDescription:
        '请按照通知内容进行申请、预约、咨询或确认后续更新。',
      contactHeading: '咨询方式',
      contactNote:
        '如果不清楚适用哪项服务，或需要办事帮助，请联系未来市市政咨询服务中心。',
      contactPhoneLabel: '电话',
      backToCategory: '返回分类页面',
      publishedLabel: '发布日期',
      readMore: '查看详情',
      lifeTopics: {
        garbageSorting: '垃圾分类与收集',
        bulkyWaste: '大件垃圾',
        pregnancyChildbirth: '怀孕与分娩',
        nurseryKindergarten: '保育园与幼儿园',
        emergencyCare: '紧急医疗',
        disasterPreparedness: '防灾准备',
        movingNotification: '迁入、迁出及搬迁申报',
        familyRegister: '户籍申报',
        facilitySearch: '公共设施查询',
        accessibleFacilities: '无障碍设施',
        eventCalendar: '活动日历',
        tourismGuide: '观光指南',
        procedureFaq: '办事手续常见问题',
        onlineServiceFaq: '在线服务常见问题',
        submitOpinion: '向未来市提交市政意见与建议',
        contactCenter: '市政咨询服务中心',
        healthCheckups: '健康检查',
        seniorCare: '老年人照护与支援',
        schoolEnrollment: '入学手续',
        educationConsultation: '教育咨询',
        myNumberApplication: '个人编号卡申请',
        convenienceCertificates: '便利店证明文件开具服务',
        dailyLifeConsultation: '日常生活咨询',
        legalConsultation: '法律咨询',
        residentTax: '居民税',
        nationalHealthInsurance: '国民健康保险',
        librarySearchReserve: '馆藏查询与预约',
        libraryCard: '图书馆借阅证',
        openDataCatalog: '开放数据目录',
        cityStatistics: '市政统计',
        departmentDirectory: '部门一览',
        departmentResponsibilities: '各部门职责',
        counterSearch: '办事窗口查询',
        holidayCounter: '节假日办事窗口',
        movingGuide: '搬迁办事指南',
        housingSupport: '住房支援',
      },
      lifeTopicSummaries: {
        garbageSorting:
          '未来市按材质分类收集家庭垃圾，各地区的收集日不同。请通过收集日历确认分类方法、收集日和指定投放点。',
        bulkyWaste:
          '无法作为普通垃圾收集的大件家具和家庭用品，需要事先申请大件垃圾处理。请确认品类和尺寸后，按指定的收集或送交方式处理。',
        pregnancyChildbirth:
          '从提交怀孕申报到产后阶段，可获得母子健康手册、健康咨询和家庭访视等支援。如对身体状况或育儿感到不安，请尽早咨询。',
        nurseryKindergarten:
          '可比较未来市各保育园和幼儿园的特点，并查看申请至入园的流程。申请前请确认能否参观设施以及所需材料。',
        emergencyCare:
          '可查询夜间和节假日接诊的医疗机构，以及帮助判断突发症状的咨询服务。如出现可能危及生命的症状，请立即呼叫急救服务。',
        disasterPreparedness:
          '请查看未来市的灾害风险地图、避难场所和家庭应急储备建议。平时请与家人确认联络方式和避难路线。',
        movingNotification:
          '本指南介绍迁入未来市、迁出市外或市内搬迁所需的住址申报。请在搬迁后的规定期间内完成相应手续。',
        familyRegister:
          '可查看出生、结婚、离婚、死亡等户籍申报的办理方法。不同申报的期限和所需材料不同，请在前往窗口前确认。',
        facilitySearch:
          '可按用途或地区查询市政办公场所、社区中心、文化和体育设施。各设施页面列有开放日、交通方式和可用设备。',
        accessibleFacilities:
          '可查询配备无障碍卫生间、电梯和无障碍停车位等设备的市政设施。如需其他协助，请在到访前联系设施。',
        eventCalendar:
          '可按日期或类别查找未来市的文化、体育和亲子活动。每项活动都会说明是否需预约及参加条件。',
        tourismGuide:
          '介绍未来市的公园、文化设施、商业街及推荐游览路线。可结合季节活动和市内交通信息规划行程。',
        procedureFaq:
          '汇总搬迁、证明文件、育儿等市政手续的常见问题。可从答案直接查看相关办理步骤和服务信息。',
        onlineServiceFaq:
          '介绍在线办事中的登录、电子签名、文件上传和申请进度查询。也提供常见错误和提交中断时的处理方法。',
        submitOpinion:
          '未来市通过在线表单或邮寄方式接收对市政施策和服务的意见与建议。如希望获得个别回复，请填写联系方式。',
        contactCenter:
          '未来市市政咨询服务中心回答市政服务的一般问题，并为您指引负责部门。即使不知道所需手续的名称，也可以咨询。',
        healthCheckups:
          '可查看针对不同年龄和人生阶段的健康体检与各类筛查。请在受检前确认实施时期、预约方式和携带物品。',
        seniorCare:
          '介绍面向老年人及其家庭的介护预防、长期介护保险和居家生活支援。地区咨询窗口可一起寻找符合本人身心状况的服务。',
        schoolEnrollment:
          '介绍市立小学和初中的入学、转学手续及学区范围。如孩子在就学时需要特别照顾，请尽早咨询教育委员会。',
        educationConsultation:
          '可就学习、发育、不上学、校园欺凌等教育问题进行咨询。咨询员会倾听孩子和监护人的想法，并在需要时协调支援机构。',
        myNumberApplication:
          '介绍从申请个人编号卡到领取的整个流程。请确认照片、本人身份证明的要求，以及领卡是否需要预约。',
        convenienceCertificates:
          '持个人编号卡可在参与服务的便利店取得居民票等证明文件。使用终端前请确认可开具的证明种类和服务时间。',
        dailyLifeConsultation:
          '可咨询生活费、就业、住房、家庭问题等日常生活中的困难。专业咨询员会梳理需求，并一起寻找可用的支援或专业服务。',
        legalConsultation:
          '居民可就继承、合同、金钱纠纷、邻里问题等日常法律问题咨询律师。咨询通常需预约，请事先确认时长和需携带的材料。',
        residentTax:
          '介绍市民税的计算、申报、缴纳和课税证明。如收入或住址发生变化，请确认是否需要另行办理手续。',
        nationalHealthInsurance:
          '介绍国民健康保险的加入、退出、保费和给付申请。就业、退休或搬迁导致保险状态变化时，可能需要申报。',
        librarySearchReserve:
          '可检索未来市立图书馆的馆藏，并预约已借出的资料。登录后还可指定取书馆，并对符合条件的资料申请续借。',
        libraryCard:
          '符合市内居住、工作、就学等条件的人员可申请图书馆借阅证。请携带本人身份证明到图书馆窗口完成登记。',
        openDataCatalog:
          '可按主题或文件格式检索未来市公开的统计、设施和环境等数据。重新利用时请确认许可条件和更新日期，并标明来源。',
        cityStatistics:
          '未来市通过数据面板和报告公开人口、家庭、产业、财政等统计信息。使用时请确认各项数值的基准日和用语定义。',
        departmentDirectory:
          '可查看未来市的组织架构、各部门联系方式和办公地点。除部门名称外，还可按办事或咨询目的搜索。',
        departmentResponsibilities:
          '介绍各市政部门负责的施策、办事手续和设施管理等工作。可根据咨询内容确认对应的负责部门。',
        counterSearch:
          '可根据所需手续查询对应窗口的位置、办公时间和预约要求。还可查看无障碍设备和交通信息。',
        holidayCounter:
          '部分窗口在指定节假日受理某些证明文件和住址变更申报。由于并非所有业务都可办理，请在前往前确认受理范围。',
        movingGuide:
          '汇总迁入或迁出未来市时的住民登记、保险、育儿和生活服务等手续。可根据家庭情况制作搬迁前后检查清单。',
        housingSupport:
          '可查看公共住房、租金支援、住房改造和住居咨询等项目。各项目的适用条件不同，请结合家庭情况进行比较。',
      },
      newsSummaries: {
        assembly:
          '令和8年第2次未来市议会例会将于6月10日至19日召开，包括全体会议和委员会。会期指南同时介绍审议议案和旁听方法。',
        construction:
          '鉴于中东局势对材料价格和物流的影响，本通知说明未来市工程承包合同的处理方针。内容包括与承包方的协商和合同条件复核方法。',
        floodBoard:
          '本项目支持为防止建筑物进水而安装止水板，或购买便携式止水设备。请在施工或购买前确认适用的建筑类型和申请步骤。',
        aircon:
          '未来市为符合条件的低收入家庭和生活保护家庭提供空调购置与安装支持，以降低中暑风险。部分申请需在购买前审核，请先确认条件和流程。',
        floodDamage:
          '遭遇浸水的居民可查询排水、灾害垃圾处理、消毒和罹灾证明的咨询窗口。请在确保安全后记录受灾情况，并联系合适的服务。',
        myNumberExpress:
          '婴儿首次申请、卡片丢失后补发等符合条件的情形可使用个人编号卡加急发放。申请窗口和所需材料会因申请事由而异。',
        minpaku:
          '未来市公布了住宅住宿业与安全舒适的社区环境协调发展的见解。方针涵盖经营者的妥善管理和对附近居民咨询的应对。',
        measles:
          '介绍麻疹的症状、避免扩大感染的就诊方式和预防接种。如怀疑感染，请在到院前先联系医疗机构。',
        furigana:
          '居民票将记载姓名和旧姓的读音，未来市会向居民发送载有预定读音的通知。如通知中的读音不正确，需要提交申报。',
        setayell:
          '“未来援（Mira-Yell）”是未来市面向离开儿童养护设施、寄养家庭等并开始独立生活的青年开设的咨询项目。项目提供生活、住房、就业方面的持续支援及专业机构转介。',
        childcare:
          '未来市版儿童普惠通园制度允许符合条件且未在保育设施入园的婴幼儿，不受监护人就业状况限制地使用参与设施。家庭可根据孩子年龄和希望的使用方式选择设施。',
        solar:
          '本实证项目旨在验证如何在社区内利用住宅太阳能发电的余电。如有参与机会，将同时说明适用设备和项目期间采集的数据。',
      },
    },
    footer: {
      terms: '使用条款',
      privacy: '隐私政策',
      buildingGuide: '办公楼指南',
      feedback: '意见・要望',
      sitemap: '网站地图',
      login: '登录',
      goToAdmin: '管理页面',
      postalCode: '〒100-0001',
      address: '未来县未来市中央1-2-3',
      tower: '未来城市大厦',
      phoneLabel: '电话号码：',
      phoneNote: '（总机）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
    docs: {
      viewAsMarkdown: '查看 Markdown 版本',
    },
    auth: {
      loginTitle: '管理登录',
      loginDescription: '访问面向演示运营者的文章编辑、电话号码变更等管理功能。',
      email: '电子邮件地址',
      password: '密码',
      currentPassword: '当前密码',
      newPassword: '新密码',
      name: '姓名',
      role: '权限',
      roleUser: '普通用户',
      roleAdmin: '管理员',
      login: '登录',
      signOut: '退出登录',
      forgotPassword: '申请重置密码',
      forgotPasswordTitle: '密码重置申请',
      forgotPasswordDescription: '管理员将确认申请并发放新的临时密码。',
      requestReset: '申请重置',
      resetRequestSent: '已受理申请。请等待管理员通知。',
      changePasswordTitle: '更改密码',
      changePasswordDescription: '使用临时密码登录后，请先更改为新密码。',
      changePassword: '更改密码',
      passwordChanged: '密码已更改。',
      temporaryPassword: '临时密码',
      temporaryPasswordDescription:
        '临时密码只会显示一次。请通过安全方式共享给目标用户。',
      required: '必填',
      error: '处理失败。',
    },
    admin: {
      title: '管理页面',
      users: '用户管理',
      newUser: '创建用户',
      passwordResets: '重置申请',
      userListTitle: '用户管理',
      searchPlaceholder: '按姓名或电子邮件搜索',
      search: '搜索',
      clear: '清除',
      createUserTitle: '管理员创建用户',
      createUserDescription: '发放首次登录用临时密码，并要求首次登录后更改。',
      createUser: '创建用户',
      email: '电子邮件地址',
      name: '姓名',
      role: '权限',
      mustChangePassword: '需要更改密码',
      createdAt: '创建时间',
      status: '状态',
      requestedAt: '申请时间',
      reviewedAt: '确认时间',
      approve: '批准',
      reject: '拒绝',
      pending: '待处理',
      approved: '已批准',
      rejected: '已拒绝',
      consumed: '已更改',
      noUsers: '没有符合条件的用户。',
      noResetRequests: '没有密码重置申请。',
      page: '页面',
      previous: '上一页',
      next: '下一页',
      issuedPasswordTitle: '已发放临时密码',
      issuedPasswordDescription:
        '关闭此画面后无法再次显示。共享后请用户登录并更改密码。',
      adminOnly: '仅限管理员访问。',
      dashboardTitle: '管理页面',
      dashboardDescription: '您已登录。用户管理功能需要管理员权限。',
    },
  },
  'zh-Hant': {
    cityName: '未來市',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: '交通・設施導覽',
      language: '語言',
      openMenu: '開啟選單',
      closeMenu: '關閉選單',
    },
    theme: {
      light: '淺色',
      dark: '深色',
    },
    headerCompact: {
      notFound: '找不到想要的資訊時',
      consultAi: '諮詢 AI 客服員',
    },
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
          feedback: '對未來市市政的意見',
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
        assembly: '令和8年第2次未來市議會例會將於6月10日至6月19日召開',
        construction: '關於在中東局勢下確保適當工程承包合約的通知',
        floodBoard: '止水板設置等補助制度的介紹',
        aircon: '面向低收入家庭及生活保護家庭的空調購置費等補助介紹',
        floodDamage: '遭遇浸水災害時的應對',
        myNumberExpress: '關於個人編號卡的加急發放',
        minpaku: '未來市關於規範住宅住宿業的見解',
        measles: '請注意麻疹',
        furigana: '居民票將記載姓名及舊姓的振假名（讀音）',
        setayell:
          '面向離開兒童養護設施或寄養家庭青年的諮詢支援計畫「未來援（Mira-Yell）」',
        childcare: '關於未來市版兒童普惠通園制度（嬰幼兒通園支援事業）',
        solar: '關於利用住宅太陽能發電餘電的實證計畫',
      },
    },
    contentPages: {
      breadcrumbLabel: '麵包屑導覽',
      tableOfContents: '本頁目錄',
      home: '首頁',
      lifeIndexTitle: '生活資訊',
      lifeIndexLead: '請依分類查找與日常生活相關的辦理事項和服務。',
      newsIndexTitle: '通知公告',
      newsIndexLead: '彙整未來市發布的最新消息和重點資訊。',
      allCategories: '查看所有生活資訊分類',
      allNews: '查看所有通知公告',
      categoryLead:
        '本頁彙整與「{name}」相關的主要辦理事項和服務。請選擇您想瞭解的項目。',
      topicCardLead: '查看「{name}」的概要與辦理重點。',
      topicLead: '本頁介紹「{name}」的概要、需確認事項及使用方式。',
      topicsHeading: '主要辦理事項與服務',
      overviewHeading: '概要',
      checkHeading: '請先確認',
      checkEligibility: '適用對象',
      checkDocuments: '所需文件',
      checkHowToUse: '辦理或使用方式',
      checkEligibilityDescription:
        '請確認各項指南中列明的適用年齡、居住條件和受理期間等條件。未列明條件的資訊可直接使用。',
      checkDocumentsDescription:
        '如需申請或預約，請事先確認本人身分證明、當日需攜帶的物品等必要文件。',
      checkHowToUseDescription:
        '請確認頁面內容，並視需要透過線上、辦事窗口或電話辦理手續或進行諮詢。',
      newsScopeHeading: '適用對象與影響範圍',
      newsScopeDescription:
        '請確認本通知適用的人員和地區，以及可能受影響的手續或服務。',
      newsConfirmationHeading: '確認事項',
      newsConfirmationDescription:
        '請依通知內容確認實施時間、條件和注意事項等必要資訊。',
      newsActionHeading: '下一步',
      newsActionDescription:
        '請依通知內容進行申請、預約、諮詢或確認後續更新。',
      contactHeading: '諮詢方式',
      contactNote:
        '如不清楚適用哪項服務，或需要辦事協助，請聯絡未來市市政諮詢服務中心。',
      contactPhoneLabel: '電話',
      backToCategory: '返回分類頁面',
      publishedLabel: '發布日期',
      readMore: '查看詳情',
      lifeTopics: {
        garbageSorting: '垃圾分類與收集',
        bulkyWaste: '大型垃圾',
        pregnancyChildbirth: '懷孕與分娩',
        nurseryKindergarten: '保育園與幼兒園',
        emergencyCare: '緊急醫療',
        disasterPreparedness: '防災準備',
        movingNotification: '遷入、遷出及搬遷申報',
        familyRegister: '戶籍申報',
        facilitySearch: '公共設施查詢',
        accessibleFacilities: '無障礙設施',
        eventCalendar: '活動日曆',
        tourismGuide: '觀光指南',
        procedureFaq: '辦理手續常見問題',
        onlineServiceFaq: '線上服務常見問題',
        submitOpinion: '向未來市提交市政意見與建議',
        contactCenter: '市政諮詢服務中心',
        healthCheckups: '健康檢查',
        seniorCare: '高齡者照護與支援',
        schoolEnrollment: '入學手續',
        educationConsultation: '教育諮詢',
        myNumberApplication: '個人編號卡申請',
        convenienceCertificates: '便利商店證明文件核發服務',
        dailyLifeConsultation: '日常生活諮詢',
        legalConsultation: '法律諮詢',
        residentTax: '居民稅',
        nationalHealthInsurance: '國民健康保險',
        librarySearchReserve: '館藏查詢與預約',
        libraryCard: '圖書館借閱證',
        openDataCatalog: '開放資料目錄',
        cityStatistics: '市政統計',
        departmentDirectory: '部門一覽',
        departmentResponsibilities: '各部門職責',
        counterSearch: '辦事窗口查詢',
        holidayCounter: '假日辦事窗口',
        movingGuide: '搬遷辦事指南',
        housingSupport: '住宅支援',
      },
      lifeTopicSummaries: {
        garbageSorting:
          '未來市依材質分類收集家庭垃圾，各地區的收集日不同。請透過收集日曆確認分類方式、收集日和指定投放點。',
        bulkyWaste:
          '無法作為一般垃圾收集的大型家具和家庭用品，需要事先申請大型垃圾處理。請確認品項和尺寸後，依指定的收集或送交方式處理。',
        pregnancyChildbirth:
          '從提交懷孕申報到產後階段，可獲得母子健康手冊、健康諮詢和家庭訪視等支援。如對身體狀況或育兒感到不安，請儘早諮詢。',
        nurseryKindergarten:
          '可比較未來市各保育園和幼兒園的特點，並查看申請至入園的流程。申請前請確認能否參觀設施以及所需文件。',
        emergencyCare:
          '可查詢夜間和假日接診的醫療機構，以及協助判斷突發症狀的諮詢服務。如出現可能危及生命的症狀，請立即呼叫救護服務。',
        disasterPreparedness:
          '請查看未來市的災害風險地圖、避難場所和家庭應急儲備建議。平時請與家人確認聯絡方式和避難路線。',
        movingNotification:
          '本指南介紹遷入未來市、遷出市外或市內搬遷所需的住址申報。請在搬遷後的規定期間內完成相應手續。',
        familyRegister:
          '可查看出生、結婚、離婚、死亡等戶籍申報的辦理方式。不同申報的期限和所需文件不同，請在前往窗口前確認。',
        facilitySearch:
          '可依用途或地區查詢市政辦公場所、社區中心、文化和體育設施。各設施頁面列有開放日、交通方式和可用設備。',
        accessibleFacilities:
          '可查詢配備無障礙廁所、電梯和無障礙停車位等設備的市政設施。如需其他協助，請在到訪前聯絡設施。',
        eventCalendar:
          '可依日期或類別查找未來市的文化、體育和親子活動。每項活動都會說明是否需預約及參加條件。',
        tourismGuide:
          '介紹未來市的公園、文化設施、商圈及建議遊覽路線。可結合季節活動和市內交通資訊安排行程。',
        procedureFaq:
          '彙整搬遷、證明文件、育兒等市政手續的常見問題。可從答案直接查看相關辦理步驟和服務資訊。',
        onlineServiceFaq:
          '介紹線上辦事的登入、電子簽章、檔案上傳和申請進度查詢。也提供常見錯誤和送出中斷時的處理方式。',
        submitOpinion:
          '未來市透過線上表單或郵寄方式接收對市政政策和服務的意見與建議。如希望獲得個別回覆，請填寫聯絡方式。',
        contactCenter:
          '未來市市政諮詢服務中心回答市政服務的一般問題，並為您指引負責部門。即使不知道所需手續的名稱，也可以諮詢。',
        healthCheckups:
          '可查看針對不同年齡和人生階段的健康檢查與各類篩檢。請在受檢前確認實施時期、預約方式和攜帶物品。',
        seniorCare:
          '介紹面向高齡者及其家庭的介護預防、長期介護保險和居家生活支援。地區諮詢窗口可一起尋找符合本人身心狀況的服務。',
        schoolEnrollment:
          '介紹市立小學和國中的入學、轉學手續及學區範圍。如孩子在就學時需要特別照顧，請儘早諮詢教育委員會。',
        educationConsultation:
          '可就學習、發展、不上學、校園霸凌等教育問題進行諮詢。諮詢員會傾聽孩子和監護人的想法，並在需要時協調支援機構。',
        myNumberApplication:
          '介紹從申請個人編號卡到領取的完整流程。請確認照片、本人身分證明的要求，以及領卡是否需要預約。',
        convenienceCertificates:
          '持個人編號卡可在參與服務的便利商店取得居民票等證明文件。使用終端前請確認可核發的證明種類和服務時間。',
        dailyLifeConsultation:
          '可諮詢生活費、就業、住房、家庭問題等日常生活中的困難。專業諮詢員會梳理需求，並一起尋找可用的支援或專業服務。',
        legalConsultation:
          '居民可就繼承、合約、金錢糾紛、鄰里問題等日常法律問題諮詢律師。諮詢通常需預約，請事先確認時間和需攜帶的文件。',
        residentTax:
          '介紹市民稅的計算、申報、繳納和課稅證明。如收入或住址發生變化，請確認是否需要另行辦理手續。',
        nationalHealthInsurance:
          '介紹國民健康保險的加入、退出、保費和給付申請。就業、退休或搬遷導致保險狀態變化時，可能需要申報。',
        librarySearchReserve:
          '可檢索未來市立圖書館的館藏，並預約已借出的資料。登入後還可指定取書館，並對符合條件的資料申請延期。',
        libraryCard:
          '符合市內居住、工作、就學等條件的人士可申請圖書館借閱證。請攜帶本人身分證明到圖書館窗口完成登記。',
        openDataCatalog:
          '可依主題或檔案格式檢索未來市公開的統計、設施和環境等資料。再利用時請確認授權條件和更新日期，並標明來源。',
        cityStatistics:
          '未來市透過資料儀表板和報告公開人口、家庭、產業、財政等統計資訊。使用時請確認各項數值的基準日和用語定義。',
        departmentDirectory:
          '可查看未來市的組織架構、各部門聯絡方式和辦公地點。除部門名稱外，還可依辦事或諮詢目的搜尋。',
        departmentResponsibilities:
          '介紹各市政部門負責的政策、辦事手續和設施管理等工作。可依諮詢內容確認對應的負責部門。',
        counterSearch:
          '可依所需手續查詢對應窗口的位置、辦公時間和預約要求。還可查看無障礙設備和交通資訊。',
        holidayCounter:
          '部分窗口在指定假日受理某些證明文件和住址變更申報。由於並非所有業務都可辦理，請在前往前確認受理範圍。',
        movingGuide:
          '彙整遷入或遷出未來市時的居民登記、保險、育兒和生活服務等手續。可依家庭狀況建立搬遷前後檢查清單。',
        housingSupport:
          '可查看公共住宅、租金支援、住宅改造和住居諮詢等計畫。各計畫的適用條件不同，請結合家庭狀況進行比較。',
      },
      newsSummaries: {
        assembly:
          '令和8年第2次未來市議會例會將於6月10日至19日召開，包括全體會議和委員會。會期指南同時介紹審議議案和旁聽方式。',
        construction:
          '因應中東局勢對材料價格和物流的影響，本通知說明未來市工程承攬契約的處理方針。內容包括與承攬方的協商和契約條件複核方式。',
        floodBoard:
          '本計畫支援為防止建築物進水而安裝止水板，或購買可攜式止水設備。請在施工或購買前確認適用的建築類型和申請步驟。',
        aircon:
          '未來市為符合條件的低收入家庭和生活保護家庭提供空調購置與安裝支援，以降低中暑風險。部分申請需在購買前審核，請先確認條件和流程。',
        floodDamage:
          '遭遇淹水的居民可查詢排水、災害垃圾處理、消毒和罹災證明的諮詢窗口。請在確保安全後記錄受災情況，並聯絡合適的服務。',
        myNumberExpress:
          '嬰兒首次申請、卡片遺失後補發等符合條件的情形可使用個人編號卡快速核發。申請窗口和所需文件會依申請事由而異。',
        minpaku:
          '未來市公布了住宅住宿業與安全舒適的社區環境協調發展的見解。方針涵蓋經營者的妥善管理和對附近居民諮詢的應對。',
        measles:
          '介紹麻疹的症狀、避免擴大感染的就診方式和預防接種。如懷疑感染，請在到院前先聯絡醫療機構。',
        furigana:
          '居民票將記載姓名和舊姓的讀音，未來市會向居民寄送載有預定讀音的通知。如通知中的讀音不正確，需要提交申報。',
        setayell:
          '「未來援（Mira-Yell）」是未來市面向離開兒童養護設施、寄養家庭等並開始獨立生活的青年開設的諮詢計畫。計畫提供生活、住宅、就業方面的持續支援及專業機構轉介。',
        childcare:
          '未來市版兒童普惠通園制度允許符合條件且未在保育設施入園的嬰幼兒，不受監護人就業狀況限制地使用參與設施。家庭可依孩子年齡和希望的使用方式選擇設施。',
        solar:
          '本實證計畫旨在驗證如何在社區內利用住宅太陽能發電的餘電。如有參與機會，將同時說明適用設備和計畫期間收集的資料。',
      },
    },
    footer: {
      terms: '使用條款',
      privacy: '隱私權政策',
      buildingGuide: '辦公大樓導覽',
      feedback: '意見・需求',
      sitemap: '網站地圖',
      login: '登入',
      goToAdmin: '管理頁面',
      postalCode: '〒100-0001',
      address: '未來縣未來市中央1-2-3',
      tower: '未來城市大樓',
      phoneLabel: '電話號碼：',
      phoneNote: '（總機）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
    docs: {
      viewAsMarkdown: '檢視 Markdown 版本',
    },
    auth: {
      loginTitle: '管理登入',
      loginDescription: '存取面向示範營運者的文章編輯、電話號碼變更等管理功能。',
      email: '電子郵件地址',
      password: '密碼',
      currentPassword: '目前密碼',
      newPassword: '新密碼',
      name: '姓名',
      role: '權限',
      roleUser: '一般使用者',
      roleAdmin: '管理員',
      login: '登入',
      signOut: '登出',
      forgotPassword: '申請重設密碼',
      forgotPasswordTitle: '密碼重設申請',
      forgotPasswordDescription: '管理員將確認申請並發放新的臨時密碼。',
      requestReset: '申請重設',
      resetRequestSent: '已受理申請。請等待管理員通知。',
      changePasswordTitle: '變更密碼',
      changePasswordDescription: '使用臨時密碼登入後，請先變更為新密碼。',
      changePassword: '變更密碼',
      passwordChanged: '密碼已變更。',
      temporaryPassword: '臨時密碼',
      temporaryPasswordDescription:
        '臨時密碼只會顯示一次。請透過安全方式分享給目標使用者。',
      required: '必填',
      error: '處理失敗。',
    },
    admin: {
      title: '管理頁面',
      users: '使用者管理',
      newUser: '建立使用者',
      passwordResets: '重設申請',
      userListTitle: '使用者管理',
      searchPlaceholder: '依姓名或電子郵件搜尋',
      search: '搜尋',
      clear: '清除',
      createUserTitle: '管理員建立使用者',
      createUserDescription: '發放首次登入用臨時密碼，並要求首次登入後變更。',
      createUser: '建立使用者',
      email: '電子郵件地址',
      name: '姓名',
      role: '權限',
      mustChangePassword: '需要變更密碼',
      createdAt: '建立時間',
      status: '狀態',
      requestedAt: '申請時間',
      reviewedAt: '確認時間',
      approve: '核准',
      reject: '拒絕',
      pending: '待處理',
      approved: '已核准',
      rejected: '已拒絕',
      consumed: '已變更',
      noUsers: '沒有符合條件的使用者。',
      noResetRequests: '沒有密碼重設申請。',
      page: '頁面',
      previous: '上一頁',
      next: '下一頁',
      issuedPasswordTitle: '已發放臨時密碼',
      issuedPasswordDescription:
        '關閉此畫面後無法再次顯示。分享後請使用者登入並變更密碼。',
      adminOnly: '僅限管理員存取。',
      dashboardTitle: '管理頁面',
      dashboardDescription: '您已登入。使用者管理功能需要管理員權限。',
    },
  },
  ko: {
    cityName: '미래시',
    cityNameRoman: 'MIRAI CITY',
    nav: {
      access: '오시는 길・시설 안내',
      language: '언어',
      openMenu: '메뉴 열기',
      closeMenu: '메뉴 닫기',
    },
    theme: {
      light: '라이트',
      dark: '다크',
    },
    headerCompact: {
      notFound: '원하는 정보를 찾지 못할 때',
      consultAi: 'AI 오퍼레이터 상담',
    },
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
          feedback: '미래시 시정에 대한 의견',
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
        assembly: '레이와 8년 제2회 미래시의회 정례회를 6월 10일부터 6월 19일까지 개최합니다',
        construction: '중동 정세를 고려한 적정한 공사 도급 계약 확보에 관하여(통지)',
        floodBoard: '지수판 설치 등 보조 제도 안내',
        aircon: '저소득 세대 및 생활보호 세대를 위한 에어컨 구입비 등 보조 안내',
        floodDamage: '침수 피해를 입었다면',
        myNumberExpress: '마이넘버 카드 특급 발급에 관하여',
        minpaku: '주택숙박사업의 적정한 운영에 관한 미래시의 견해',
        measles: '홍역(마진)에 주의하세요',
        furigana: '주민표에 성명·구성(旧氏)의 후리가나가 기재됩니다',
        setayell:
          "아동양호시설이나 위탁가정 등을 떠난 청년을 위한 상담 지원 사업 '미라옐(Mira-Yell)'",
        childcare: '미래시판 어린이 누구나 통원 제도(영유아 등 통원 지원 사업)에 관하여',
        solar: '주택용 태양광 발전 잉여 전력을 활용한 실증 사업 안내',
      },
    },
    contentPages: {
      breadcrumbLabel: '현재 위치',
      tableOfContents: '페이지 목차',
      home: '홈',
      lifeIndexTitle: '생활 정보',
      lifeIndexLead: '생활에 필요한 정보를 분야별로 안내합니다.',
      newsIndexTitle: '알림',
      newsIndexLead: '미래시의 최신 소식과 주요 정보를 안내합니다.',
      allCategories: '생활 정보 전체 카테고리',
      allNews: '전체 알림',
      categoryLead: '{name}에 관한 주요 정보를 안내합니다.',
      topicCardLead: '{name}의 개요와 수속 시 확인할 사항을 안내합니다.',
      topicLead: '{name}의 개요와 수속 시 확인할 사항을 안내합니다.',
      topicsHeading: '주요 정보',
      overviewHeading: '개요',
      checkHeading: '확인 사항',
      checkEligibility: '이용 대상',
      checkDocuments: '필요 서류',
      checkHowToUse: '이용・신청 방법',
      checkEligibilityDescription:
        '대상 연령, 거주 요건, 접수 기간 등 각 안내에 기재된 조건을 확인해 주세요. 별도 조건이 없는 정보는 그대로 이용할 수 있습니다.',
      checkDocumentsDescription:
        '신청이나 예약이 필요한 경우에는 본인 확인 서류와 당일 지참물 등 필요한 사항을 미리 확인해 주세요.',
      checkHowToUseDescription:
        '게시된 내용을 확인한 후 필요에 따라 온라인, 민원 창구 또는 전화로 수속하거나 상담해 주세요.',
      newsScopeHeading: '대상・영향 범위',
      newsScopeDescription:
        '이 알림의 대상자와 지역, 영향을 받는 수속이나 서비스를 확인해 주세요.',
      newsConfirmationHeading: '확인 사항',
      newsConfirmationDescription:
        '시행 시기, 조건, 주의사항 등 알림 내용에 따른 필요 정보를 확인해 주세요.',
      newsActionHeading: '다음 단계',
      newsActionDescription:
        '신청, 예약, 상담, 최신 상황 확인 등 알림에 기재된 방법에 따라 조치해 주세요.',
      contactHeading: '문의',
      contactNote:
        '어떤 서비스가 해당되는지 모르거나 수속에 도움이 필요하면 미래시 문의센터로 연락해 주세요.',
      contactPhoneLabel: '전화',
      backToCategory: '이 카테고리로 돌아가기',
      publishedLabel: '게시일',
      readMore: '자세히 보기',
      lifeTopics: {
        garbageSorting: '쓰레기 분리배출・수거',
        bulkyWaste: '대형 폐기물',
        pregnancyChildbirth: '임신・출산',
        nurseryKindergarten: '어린이집・유치원',
        emergencyCare: '응급 의료',
        disasterPreparedness: '재난 대비',
        movingNotification: '이사 관련 주민등록 신고',
        familyRegister: '호적 관련 신고',
        facilitySearch: '시설 찾기',
        accessibleFacilities: '배리어프리 시설',
        eventCalendar: '이벤트 캘린더',
        tourismGuide: '관광 안내',
        procedureFaq: '수속 관련 자주 묻는 질문',
        onlineServiceFaq: '온라인 수속 관련 자주 묻는 질문',
        submitOpinion: '미래시 시정에 대한 의견・요청',
        contactCenter: '시 문의센터',
        healthCheckups: '건강검진・검사',
        seniorCare: '고령자・개호',
        schoolEnrollment: '입학・전학',
        educationConsultation: '교육 상담',
        myNumberApplication: '마이넘버 카드 신청',
        convenienceCertificates: '편의점 증명서 발급',
        dailyLifeConsultation: '생활 상담',
        legalConsultation: '법률 상담',
        residentTax: '주민세',
        nationalHealthInsurance: '국민건강보험',
        librarySearchReserve: '도서 검색・예약',
        libraryCard: '도서관 이용 카드',
        openDataCatalog: '오픈 데이터 카탈로그',
        cityStatistics: '시 통계',
        departmentDirectory: '조직・부서 목록',
        departmentResponsibilities: '부서별 업무',
        counterSearch: '민원 창구 찾기',
        holidayCounter: '휴일 민원 창구',
        movingGuide: '이사 수속 안내',
        housingSupport: '주거 지원',
      },
      lifeTopicSummaries: {
        garbageSorting:
          '미래시는 가정 폐기물을 재질별로 분류해 지역별 수거일에 회수합니다. 수거 달력에서 분리배출 방법, 수거일, 지정 배출 장소를 확인해 주세요.',
        bulkyWaste:
          '일반 폐기물로 수거할 수 없는 큰 가구와 생활용품은 대형 폐기물로 사전 신청해야 합니다. 품목과 크기를 확인한 후 지정된 수거 또는 반입 방법을 따라 주세요.',
        pregnancyChildbirth:
          '임신 신고부터 출산 후까지 모자건강수첩, 건강 상담, 가정 방문 등을 지원합니다. 건강이나 육아에 걱정이 있다면 조기에 상담해 주세요.',
        nurseryKindergarten:
          '미래시 어린이집과 유치원의 특징을 비교하고 신청부터 입원까지의 절차를 확인할 수 있습니다. 신청 전에 시설 견학 가능 여부와 필요 서류도 확인해 주세요.',
        emergencyCare:
          '야간과 휴일에 진료하는 의료기관과 급성 증상을 판단하는 데 도움을 주는 상담 서비스를 안내합니다. 생명에 위험이 될 수 있는 증상이면 즉시 구급 요청을 하세요.',
        disasterPreparedness:
          '미래시 재해위험지도, 피난소, 가정용 비상 비축품을 확인할 수 있습니다. 평소에 가족과 연락 방법과 피난 경로를 확인해 두세요.',
        movingNotification:
          '미래시로의 전입, 시외 전출, 시내 전거에 필요한 주소 변경 신고를 안내합니다. 이사 후 정해진 기간 안에 해당 절차를 마쳐 주세요.',
        familyRegister:
          '출생, 혼인, 이혼, 사망 등의 가족관계등록 신고 방법을 안내합니다. 신고 종류에 따라 기한과 필요 서류가 다르므로 방문 전에 확인해 주세요.',
        facilitySearch:
          '시청, 지역센터, 문화・스포츠 시설을 목적이나 지역으로 검색할 수 있습니다. 각 시설의 운영일, 교통, 이용 가능한 편의시설도 확인할 수 있습니다.',
        accessibleFacilities:
          '휠체어 이용 화장실, 승강기, 장애인 전용 주차구역 등을 갖춘 시설을 찾을 수 있습니다. 추가 지원이 필요하면 방문 전에 시설에 문의해 주세요.',
        eventCalendar:
          '미래시의 문화, 스포츠, 가족 행사를 날짜나 분야로 찾을 수 있습니다. 각 행사 안내에서 예약 필요 여부와 참가 조건을 확인해 주세요.',
        tourismGuide:
          '미래시의 공원, 문화시설, 상점가와 추천 관광 코스를 소개합니다. 계절 행사와 시내 교통 정보를 함께 활용해 일정을 계획해 보세요.',
        procedureFaq:
          '이사, 증명서, 육아 등 시정 절차에 관한 자주 묻는 질문을 모았습니다. 각 답변에서 관련 신청 절차와 서비스 안내로 이동할 수 있습니다.',
        onlineServiceFaq:
          '온라인 수속의 로그인, 전자서명, 파일 첨부, 신청 진행 상황 확인을 안내합니다. 자주 발생하는 오류와 제출 중단 시 해결 방법도 확인할 수 있습니다.',
        submitOpinion:
          '미래시는 시정 정책과 서비스에 대한 의견과 요청을 온라인 또는 우편으로 접수합니다. 개별 답변을 원하면 연락처를 함께 알려 주세요.',
        contactCenter:
          '미래시 문의센터는 시정 서비스에 관한 일반적인 질문에 답하고 담당 부서를 안내합니다. 필요한 수속의 이름을 모르는 경우에도 상담할 수 있습니다.',
        healthCheckups:
          '나이와 생애 단계에 맞춘 건강검진과 각종 검사를 안내합니다. 검진 시기, 예약 방법, 당일 지참물을 미리 확인해 주세요.',
        seniorCare:
          '고령자와 가족을 위한 개호 예방, 개호보험, 재가생활 지원 서비스를 안내합니다. 지역 상담 창구에서 본인의 심신 상태에 맞는 지원을 함께 찾을 수 있습니다.',
        schoolEnrollment:
          '시립 초・중학교 입학과 전학 절차, 통학구역을 안내합니다. 취학 시 배려가 필요한 아동은 교육위원회에 조기에 상담해 주세요.',
        educationConsultation:
          '학습, 발달, 학교 부적응, 괴롭힘 등 아동의 교육에 관한 상담을 접수합니다. 상담원이 아동과 보호자의 얘기를 듣고 필요한 지원기관과 연계합니다.',
        myNumberApplication:
          '마이넘버 카드 신청부터 수령까지의 절차를 안내합니다. 사진과 본인 확인 서류 요건, 수령 창구 예약 필요 여부를 확인해 주세요.',
        convenienceCertificates:
          '마이넘버 카드로 참여 편의점에서 주민표 등 대상 증명서를 발급받을 수 있습니다. 무인민원발급기 이용 전에 발급 가능한 증명서와 서비스 시간을 확인해 주세요.',
        dailyLifeConsultation:
          '생활비, 일자리, 주거, 가족 문제 등 일상의 어려움을 상담할 수 있습니다. 전문 상담원이 상황을 정리하고 이용할 수 있는 지원과 전문 서비스를 함께 찾습니다.',
        legalConsultation:
          '상속, 계약, 금전 분쟁, 이웃 갈등 등 일상의 법률 문제를 변호사에게 상담할 수 있습니다. 대부분 예약제이므로 상담 시간과 가져올 자료를 미리 확인해 주세요.',
        residentTax:
          '시민세 계산, 신고, 납부, 과세증명서에 관한 정보를 안내합니다. 소득이나 주소가 바뀐 경우 추가 수속이 필요한지 확인해 주세요.',
        nationalHealthInsurance:
          '국민건강보험의 가입・탈퇴, 보험료, 급여 신청 절차를 안내합니다. 취업, 퇴직, 이사로 보험 상태가 바뀌면 신고가 필요할 수 있습니다.',
        librarySearchReserve:
          '미래시립도서관의 자료를 검색하고 대출 중인 자료를 예약할 수 있습니다. 로그인하면 수령 도서관 선택과 대출 연장 신청도 이용할 수 있습니다.',
        libraryCard:
          '시내 거주, 재직, 재학 등의 조건을 충족하는 사람에게 도서관 이용 카드를 발급합니다. 본인 확인 서류를 가지고 도서관 창구에서 등록해 주세요.',
        openDataCatalog:
          '미래시가 공개하는 통계, 시설, 환경 등의 데이터를 분야나 파일 형식으로 검색할 수 있습니다. 재이용 시 이용 조건과 최종 갱신일을 확인하고 출처를 밝혀 주세요.',
        cityStatistics:
          '미래시는 인구, 가구, 산업, 재정 등의 통계를 대시보드와 보고서로 공개합니다. 수치의 기준일과 용어 정의를 확인한 후 이용해 주세요.',
        departmentDirectory:
          '미래시 조직도와 각 부서의 연락처, 위치를 안내합니다. 부서명 뿐만 아니라 수속이나 상담 목적으로도 검색할 수 있습니다.',
        departmentResponsibilities:
          '각 부서가 담당하는 정책, 신청 절차, 시설 관리 등의 업무를 소개합니다. 문의 내용에 맞는 담당 부서를 찾는 데 활용해 주세요.',
        counterSearch:
          '필요한 수속으로 해당 민원 창구의 위치, 운영 시간, 예약 필요 여부를 검색할 수 있습니다. 장애인 편의시설과 교통 정보도 함께 확인할 수 있습니다.',
        holidayCounter:
          '일부 창구는 지정된 휴일에 특정 증명서 발급과 주소 변경 신고를 접수합니다. 모든 업무를 처리하지는 않으므로 방문 전에 대상 업무를 확인해 주세요.',
        movingGuide:
          '미래시 전입・전출에 따른 주민등록, 보험, 육아, 생활 서비스 절차를 한눈에 안내합니다. 가구 상황에 맞춰 이사 전후 체크리스트를 만들 수 있습니다.',
        housingSupport:
          '공공주택, 임차료 지원, 주택 개수, 주거 상담 제도를 안내합니다. 대상 요건은 제도별로 다르므로 가구 상황에 맞는 선택지를 비교해 주세요.',
      },
      newsSummaries: {
        assembly:
          '레이와 8년 제2회 미래시의회 정례회는 6월 10일부터 19일까지 본회의와 위원회를 진행합니다. 회기 안내에서 심의 의안과 방청 방법도 확인할 수 있습니다.',
        construction:
          '중동 정세가 자재 가격과 물류에 미치는 영향을 고려해 미래시 공사 도급 계약의 처리 방침을 안내합니다. 수급인과의 협의와 계약 조건 검토 방법을 포함합니다.',
        floodBoard:
          '건물 침수를 막는 차수판 설치와 휴대용 차수 장비 구입을 지원하는 제도입니다. 공사나 구입 전에 대상 건물 유형과 신청 절차를 확인해 주세요.',
        aircon:
          '미래시는 폭염 건강 피해를 줄이기 위해 대상 저소득 가구와 생활보호 가구의 에어컨 구입・설치를 지원합니다. 구입 전 승인이 필요한 경우가 있으므로 요건과 순서를 먼저 확인해 주세요.',
        floodDamage:
          '침수 피해를 입은 주민을 위해 배수, 재해 폐기물 처리, 소독, 재해증명서 상담 창구를 안내합니다. 안전을 확보한 후 피해 상황을 기록하고 필요한 지원에 문의해 주세요.',
        myNumberExpress:
          '영아 최초 신청, 카드 분실 후 재발급 등 해당 사유가 있는 경우 마이넘버 카드 특급 발급을 이용할 수 있습니다. 신청 창구와 필요 서류는 신청 사유에 따라 다릅니다.',
        minpaku:
          '미래시는 주택숙박사업과 안전하고 쾌적한 지역 주거환경을 양립하기 위한 견해를 발표했습니다. 사업자의 적정한 시설 관리와 이웃 주민의 문의에 대한 대응 방침을 담고 있습니다.',
        measles:
          '홍역 증상, 감염을 퍼뜨리지 않는 진료 방법, 예방접종을 안내합니다. 감염이 의심되면 방문 전에 의료기관에 연락해 주세요.',
        furigana:
          '주민표에 성명과 구성(舊姓)의 음독을 기재하는 제도와 미래시가 보내는 통지의 확인 방법을 안내합니다. 통지에 적힌 음독이 다르면 신고가 필요합니다.',
        setayell:
          '미라옐(Mira-Yell)은 아동양호시설이나 위탁가정 등에서 자립하는 청년을 위한 미래시 상담 지원 사업입니다. 생활, 주거, 취업에 대한 지속적인 상담과 전문기관 연계를 제공합니다.',
        childcare:
          '미래시판 어린이 누구나 통원 제도는 보육시설을 이용하지 않는 대상 영유아가 보호자의 취업 여부와 관계없이 참여 시설을 이용할 수 있게 합니다. 가정은 아동의 연령과 희망하는 이용 형태에 맞춰 시설을 선택합니다.',
        solar:
          '주택용 태양광 발전의 잉여 전력을 지역에서 활용하는 방법을 검증하는 사업입니다. 참여 기회가 있을 경우 대상 설비와 사업 기간 중 수집하는 데이터를 함께 안내합니다.',
      },
    },
    footer: {
      terms: '이용약관',
      privacy: '개인정보 보호정책',
      buildingGuide: '청사 안내',
      feedback: '의견・요청',
      sitemap: '사이트맵',
      login: '로그인',
      goToAdmin: '관리 화면',
      postalCode: '〒100-0001',
      address: '미래현 미래시 주오 1-2-3',
      tower: '미래 시티 타워',
      phoneLabel: '전화번호：',
      phoneNote: '（대표）',
      copyright: '© Mirai City. All Rights Reserved.',
    },
    docs: {
      viewAsMarkdown: 'Markdown 버전 보기',
    },
    auth: {
      loginTitle: '관리 로그인',
      loginDescription: '데모 운영자를 위한 기사 작성, 전화번호 변경 등의 관리 기능에 접근합니다.',
      email: '이메일 주소',
      password: '비밀번호',
      currentPassword: '현재 비밀번호',
      newPassword: '새 비밀번호',
      name: '이름',
      role: '권한',
      roleUser: '일반 사용자',
      roleAdmin: '관리자',
      login: '로그인',
      signOut: '로그아웃',
      forgotPassword: '비밀번호 재설정 신청',
      forgotPasswordTitle: '비밀번호 재설정 신청',
      forgotPasswordDescription: '관리자가 신청을 확인하고 새 임시 비밀번호를 발급합니다.',
      requestReset: '재설정 신청',
      resetRequestSent: '신청을 접수했습니다. 관리자의 안내를 기다려 주세요.',
      changePasswordTitle: '비밀번호 변경',
      changePasswordDescription: '임시 비밀번호로 로그인한 경우 계속하기 전에 새 비밀번호로 변경하세요.',
      changePassword: '비밀번호 변경',
      passwordChanged: '비밀번호를 변경했습니다.',
      temporaryPassword: '임시 비밀번호',
      temporaryPasswordDescription:
        '임시 비밀번호는 한 번만 표시됩니다. 안전한 방법으로 대상 사용자에게 공유하세요.',
      required: '필수',
      error: '처리에 실패했습니다.',
    },
    admin: {
      title: '관리 화면',
      users: '사용자 관리',
      newUser: '사용자 생성',
      passwordResets: '재설정 신청',
      userListTitle: '사용자 관리',
      searchPlaceholder: '이름 또는 이메일로 검색',
      search: '검색',
      clear: '초기화',
      createUserTitle: '관리자 사용자 생성',
      createUserDescription: '첫 로그인용 임시 비밀번호를 발급하고 첫 로그인 후 변경을 강제합니다.',
      createUser: '사용자 생성',
      email: '이메일 주소',
      name: '이름',
      role: '권한',
      mustChangePassword: '비밀번호 변경 필요',
      createdAt: '생성 일시',
      status: '상태',
      requestedAt: '신청 일시',
      reviewedAt: '확인 일시',
      approve: '승인',
      reject: '거절',
      pending: '대기 중',
      approved: '승인됨',
      rejected: '거절됨',
      consumed: '변경됨',
      noUsers: '해당 사용자가 없습니다.',
      noResetRequests: '비밀번호 재설정 신청이 없습니다.',
      page: '페이지',
      previous: '이전',
      next: '다음',
      issuedPasswordTitle: '임시 비밀번호를 발급했습니다',
      issuedPasswordDescription:
        '이 화면을 닫으면 다시 표시할 수 없습니다. 공유 후 사용자에게 로그인과 변경을 요청하세요.',
      adminOnly: '관리자만 접근할 수 있습니다.',
      dashboardTitle: '관리 화면',
      dashboardDescription: '로그인되어 있습니다. 사용자 관리 기능에는 관리자 권한이 필요합니다.',
    },
  },
};
