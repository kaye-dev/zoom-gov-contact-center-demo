import type { SiteLocale as Locale } from '@/lib/site-settings';
import type { TenantContentDictionary } from '../../i18n/tenant-content';

/**
 * 未来市（架空の基礎自治体）のコンテンツパック。
 *
 * 業種非依存の共通文言はchrome辞書（app/i18n/dictionaries.ts）側にある。
 * このファイルは自治体デモ固有の表示文言だけを持つ。
 */
export const lgContent: Record<Locale, TenantContentDictionary> = {
  ja: {
    siteName: '未来市',
    siteNameRoman: 'MIRAI CITY',
    findInfo: {
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
      lifeIndexTitle: '生活情報',
      lifeIndexLead: '暮らしに関する情報を分野別にご案内します。',
      newsIndexLead: '未来市からの最新情報と注目情報をご案内します。',
      allCategories: '生活情報の全カテゴリ',
      contactNote:
        '対象となるサービスや手続き方法が分からないときは、未来市お問い合わせセンターへご相談ください。',
      disasterRadio: {
        title: '防災行政無線の放送内容を確認する',
        breadcrumb: '防災行政無線',
        lifeBreadcrumb: '暮らしの情報',
        safetyBreadcrumb: '防災・安全',
        contentsHeading: '本ページの目次',
        lead:
          '未来市では、防災・行政情報などを防災行政無線でお知らせしています。フォームからメールアドレスと電話番号を配信先情報として登録できます。',
        emailHeading: 'メール配信サービス',
        emailDescription:
          'メールアドレスを登録すると、防災行政無線の放送内容を携帯電話やパソコンで受信できます。',
        registrationHeading: '登録方法',
        registrationSteps: [
          '「登録用メールを開く」を選択します。',
          '件名に「ALL」と入力されていることを確認し、そのまま送信します。',
          '登録完了メールが届いたら登録完了です。',
        ],
        registrationLink: '登録用メールを開く',
        registrationAddressLabel: '登録先メールアドレス',
        senderAddressLabel: '受信許可するアドレス',
        emailNote:
          '受信拒否を設定している場合は、登録前に上記の送信元アドレスを受信できるようにしてください。掲載しているアドレスはデモ用で、実際の登録は行われません。',
        phoneHeading: '電話応答サービス',
        phoneDescription:
          '専用番号に電話をかけると、防災行政無線で放送した内容を音声で確認できます。',
        phoneNumberLabel: '電話番号',
        demoSuffix: '（デモ用）',
        phoneNote:
          'この番号は画面確認用のプレースホルダーで、実際の通話には接続しません。',
        contactHeading: 'お問い合わせ',
        contactNote:
          '防災行政無線と配信サービスについては、未来市 防災課へお問い合わせください。',
        contactPhoneLabel: '電話',
        form: {
          heading: '防災行政無線の配信登録',
          description: '空メールの送信は不要です。次のフォームに登録者情報を入力してください。',
          name: '氏名', email: 'メールアドレス', emailHelp: '防災行政無線のメール通知先です。',
          phone: '電話番号', phoneHelp: '自動音声電話の通知先です。',
          consent: '防災行政無線のお知らせをメールと自動音声電話で受け取ること、および入力情報を配信登録の管理に利用することに同意します。',
          required: '必須', submit: '防災行政無線を登録する', submitting: '登録しています…',
          syncNote: '登録情報はZAADへ保存され、管理画面の登録先設定に応じてZoomの連絡先リストへ反映されます。',
          assignmentNote: '連絡先リストが割り当てられていない場合もZAADへの登録は完了します。このデモ画面からキャンペーンの開始や自動音声電話の発信は行いません。',
          validationTitle: '入力内容を確認してください', validationMessage: '氏名、メールアドレス、電話番号、配信同意はすべて必須です。', nameValidationMessage: '氏名を入力してください。',
          serverErrorTitle: '登録を受け付けられませんでした', serverErrorMessage: '時間をおいてもう一度お試しください。入力内容は保持されています。',
          successTitle: '登録を受け付けました（デモ）', successMessage: '防災行政無線の配信登録情報を保存しました。連絡先リストへの反映状況は未来市が管理します。',
          registerAnother: '別の連絡先を登録する',
        },
      },
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
      buildingGuide: '庁舎案内',
      disasterRadio: '防災無線',
      postalCode: '〒100-0001',
      address: '未来県未来市中央1-2-3',
      tower: '未来シティタワー',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  en: {
    siteName: 'Mirai City',
    siteNameRoman: 'MIRAI CITY',
    findInfo: {
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
      lifeIndexTitle: 'Daily Life',
      lifeIndexLead: 'Browse information about everyday life by category.',
      newsIndexLead:
        'See the latest news and featured information from Mirai City.',
      allCategories: 'All Daily Life Categories',
      contactNote:
        'If you are unsure which service applies or need help with a procedure, contact the Mirai City Contact Center.',
      disasterRadio: {
        title: 'Check Disaster Prevention Radio Broadcasts',
        breadcrumb: 'Disaster Prevention Radio',
        lifeBreadcrumb: 'Daily Life',
        safetyBreadcrumb: 'Emergency, Crime & Disaster Prevention',
        contentsHeading: 'On this page',
        lead:
          'Mirai City uses its disaster prevention radio system to share emergency and municipal information. You can check broadcasts by email or through the automated phone service.',
        emailHeading: 'Email Notification Service',
        emailDescription:
          'Register an email address to receive disaster prevention radio broadcasts on a mobile phone or computer.',
        registrationHeading: 'How to Register',
        registrationSteps: [
          'Select “Open registration email.”',
          'Confirm that the subject is “ALL,” then send the message.',
          'Registration is complete when you receive the confirmation email.',
        ],
        registrationLink: 'Open registration email',
        registrationAddressLabel: 'Registration email address',
        senderAddressLabel: 'Sender address to allow',
        emailNote:
          'If you block incoming mail, allow the sender address above before registering. These addresses are non-working demo placeholders and no registration will occur.',
        phoneHeading: 'Automated Phone Service',
        phoneDescription:
          'Call the dedicated number to listen to disaster prevention radio broadcasts.',
        phoneNumberLabel: 'Phone number',
        demoSuffix: ' (demo)',
        phoneNote:
          'This number is a screen-demo placeholder and does not connect to a real call.',
        contactHeading: 'Contact Us',
        contactNote:
          'For questions about disaster prevention radio and notification services, contact the Mirai City Disaster Prevention Division.',
        contactPhoneLabel: 'Phone',
        form: {
          heading: 'Register for disaster radio notifications',
          description: 'No blank email is needed. Enter the recipient information in this form.',
          name: 'Name', email: 'Email address', emailHelp: 'Used for disaster radio email notifications.',
          phone: 'Phone number', phoneHelp: 'Used for automated voice notifications.',
          consent: 'I consent to receive disaster radio notices by email and automated voice call and to the use of this information to manage my registration.',
          required: 'Required', submit: 'Register for disaster radio', submitting: 'Registering…',
          syncNote: 'The registration is saved in ZAAD and reflected in the Zoom contact list selected by the administrator.',
          assignmentNote: 'Registration in ZAAD completes even when no contact list is assigned. This page does not start a campaign or place an automated call.',
          validationTitle: 'Check your entries', validationMessage: 'Name, email address, phone number, and consent are all required.', nameValidationMessage: 'Enter your name.',
          serverErrorTitle: 'We could not accept the registration', serverErrorMessage: 'Please try again later. Your entries have been retained.',
          successTitle: 'Registration accepted (demo)', successMessage: 'Your disaster radio registration was saved. Mirai City manages synchronization with its contact lists.',
          registerAnother: 'Register another contact',
        },
      },
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
      buildingGuide: 'Building Guide',
      disasterRadio: 'Disaster Radio',
      postalCode: '100-0001',
      address: '1-2-3 Chuo, Mirai City, Mirai Pref.',
      tower: 'Mirai City Tower',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  'zh-Hans': {
    siteName: '未来市',
    siteNameRoman: 'MIRAI CITY',
    findInfo: {
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
      lifeIndexTitle: '生活信息',
      lifeIndexLead: '请按类别查找与日常生活有关的办事和服务。',
      newsIndexLead: '汇总未来市发布的最新消息和重点信息。',
      allCategories: '查看所有生活信息分类',
      contactNote:
        '如果不清楚适用哪项服务，或需要办事帮助，请联系未来市市政咨询服务中心。',
      disasterRadio: {
        title: '查看防灾行政无线广播内容',
        breadcrumb: '防灾行政无线',
        lifeBreadcrumb: '生活信息',
        safetyBreadcrumb: '急救・防范・防灾',
        contentsHeading: '本页目录',
        lead:
          '未来市通过防灾行政无线发布防灾和行政信息。您可以使用邮件推送或电话语音服务查看广播内容。',
        emailHeading: '邮件推送服务',
        emailDescription:
          '登记电子邮件地址后，即可通过手机或电脑接收防灾行政无线的广播内容。',
        registrationHeading: '登记方法',
        registrationSteps: [
          '选择“打开登记邮件”。',
          '确认主题为“ALL”后直接发送。',
          '收到登记完成邮件后即表示登记成功。',
        ],
        registrationLink: '打开登记邮件',
        registrationAddressLabel: '登记邮箱地址',
        senderAddressLabel: '需要允许接收的发件地址',
        emailNote:
          '如设置了拒收邮件，请先允许接收上述发件地址。所列地址仅为不可用的演示占位符，不会实际登记。',
        phoneHeading: '电话语音服务',
        phoneDescription:
          '拨打专用号码即可通过语音确认防灾行政无线的广播内容。',
        phoneNumberLabel: '电话号码',
        demoSuffix: '（演示用）',
        phoneNote: '该号码仅用于画面演示，不会接通实际电话。',
        contactHeading: '咨询',
        contactNote:
          '如对防灾行政无线和推送服务有疑问，请联系未来市防灾科。',
        contactPhoneLabel: '电话',
        form: {
          heading: '防灾行政无线推送登记',
          description: '无需发送空白邮件。请在以下表单中填写接收人信息。',
          name: '姓名', email: '电子邮件地址', emailHelp: '用于接收防灾行政无线邮件通知。',
          phone: '电话号码', phoneHelp: '用于接收自动语音电话通知。',
          consent: '我同意通过电子邮件和自动语音电话接收防灾行政无线通知，并同意将所填信息用于管理推送登记。',
          required: '必填', submit: '登记防灾行政无线', submitting: '正在登记…',
          syncNote: '登记信息将保存至ZAAD，并根据管理画面的登记目标设置同步到Zoom联系人列表。',
          assignmentNote: '即使未分配联系人列表，ZAAD登记也会完成。本页面不会启动活动或拨打自动语音电话。',
          validationTitle: '请检查输入内容', validationMessage: '姓名、电子邮件地址、电话号码和推送同意均为必填项。', nameValidationMessage: '请输入姓名。',
          serverErrorTitle: '无法受理登记', serverErrorMessage: '请稍后重试。您输入的内容已保留。',
          successTitle: '已受理登记（演示）', successMessage: '防灾行政无线推送登记信息已保存。联系人列表的同步状态由未来市管理。',
          registerAnother: '登记其他联系人',
        },
      },
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
      buildingGuide: '办公楼指南',
      disasterRadio: '防灾无线',
      postalCode: '〒100-0001',
      address: '未来县未来市中央1-2-3',
      tower: '未来城市大厦',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  'zh-Hant': {
    siteName: '未來市',
    siteNameRoman: 'MIRAI CITY',
    findInfo: {
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
      lifeIndexTitle: '生活資訊',
      lifeIndexLead: '請依分類查找與日常生活相關的辦理事項和服務。',
      newsIndexLead: '彙整未來市發布的最新消息和重點資訊。',
      allCategories: '查看所有生活資訊分類',
      contactNote:
        '如不清楚適用哪項服務，或需要辦事協助，請聯絡未來市市政諮詢服務中心。',
      disasterRadio: {
        title: '查看防災行政無線廣播內容',
        breadcrumb: '防災行政無線',
        lifeBreadcrumb: '生活資訊',
        safetyBreadcrumb: '急救・防範・防災',
        contentsHeading: '本頁目錄',
        lead:
          '未來市透過防災行政無線發布防災及行政資訊。您可以使用電子郵件推播或電話語音服務查看廣播內容。',
        emailHeading: '電子郵件推播服務',
        emailDescription:
          '登記電子郵件地址後，即可透過手機或電腦接收防災行政無線的廣播內容。',
        registrationHeading: '登記方法',
        registrationSteps: [
          '選擇「開啟登記郵件」。',
          '確認主旨為「ALL」後直接寄出。',
          '收到登記完成郵件後即表示登記成功。',
        ],
        registrationLink: '開啟登記郵件',
        registrationAddressLabel: '登記電子郵件地址',
        senderAddressLabel: '需允許接收的寄件地址',
        emailNote:
          '若設定拒收郵件，請先允許接收上述寄件地址。所列地址僅為不可用的示範預留值，不會實際登記。',
        phoneHeading: '電話語音服務',
        phoneDescription:
          '撥打專用號碼，即可透過語音確認防災行政無線的廣播內容。',
        phoneNumberLabel: '電話號碼',
        demoSuffix: '（示範用）',
        phoneNote: '此號碼僅供畫面示範，不會接通實際電話。',
        contactHeading: '聯絡我們',
        contactNote:
          '如對防災行政無線和推播服務有疑問，請聯絡未來市防災課。',
        contactPhoneLabel: '電話',
        form: {
          heading: '防災行政無線推播登記',
          description: '無需寄送空白郵件。請在下列表單填寫接收人資訊。',
          name: '姓名', email: '電子郵件地址', emailHelp: '用於接收防災行政無線電子郵件通知。',
          phone: '電話號碼', phoneHelp: '用於接收自動語音電話通知。',
          consent: '我同意透過電子郵件及自動語音電話接收防災行政無線通知，並同意將輸入資訊用於管理推播登記。',
          required: '必填', submit: '登記防災行政無線', submitting: '正在登記…',
          syncNote: '登記資訊會儲存至ZAAD，並依管理畫面的登記目標設定同步到Zoom聯絡人清單。',
          assignmentNote: '即使未分配聯絡人清單，ZAAD登記仍會完成。本頁面不會啟動行銷活動或撥打自動語音電話。',
          validationTitle: '請檢查輸入內容', validationMessage: '姓名、電子郵件地址、電話號碼和推播同意皆為必填。', nameValidationMessage: '請輸入姓名。',
          serverErrorTitle: '無法受理登記', serverErrorMessage: '請稍後再試。您輸入的內容已保留。',
          successTitle: '已受理登記（示範）', successMessage: '防災行政無線推播登記資訊已儲存。聯絡人清單的同步狀態由未來市管理。',
          registerAnother: '登記其他聯絡人',
        },
      },
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
      buildingGuide: '辦公大樓導覽',
      disasterRadio: '防災無線',
      postalCode: '〒100-0001',
      address: '未來縣未來市中央1-2-3',
      tower: '未來城市大樓',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
  ko: {
    siteName: '미래시',
    siteNameRoman: 'MIRAI CITY',
    findInfo: {
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
      lifeIndexTitle: '생활 정보',
      lifeIndexLead: '생활에 필요한 정보를 분야별로 안내합니다.',
      newsIndexLead: '미래시의 최신 소식과 주요 정보를 안내합니다.',
      allCategories: '생활 정보 전체 카테고리',
      contactNote:
        '어떤 서비스가 해당되는지 모르거나 수속에 도움이 필요하면 미래시 문의센터로 연락해 주세요.',
      disasterRadio: {
        title: '방재 행정 무선 방송 내용 확인',
        breadcrumb: '방재 행정 무선',
        lifeBreadcrumb: '생활 정보',
        safetyBreadcrumb: '응급・방범・방재',
        contentsHeading: '페이지 목차',
        lead:
          '미래시는 방재 행정 무선으로 재난 및 행정 정보를 안내합니다. 이메일 알림 서비스나 전화 음성 서비스를 이용해 방송 내용을 확인할 수 있습니다.',
        emailHeading: '이메일 알림 서비스',
        emailDescription:
          '이메일 주소를 등록하면 휴대전화나 컴퓨터로 방재 행정 무선 방송 내용을 받을 수 있습니다.',
        registrationHeading: '등록 방법',
        registrationSteps: [
          '“등록 이메일 열기”를 선택합니다.',
          '제목이 “ALL”인지 확인한 후 그대로 전송합니다.',
          '등록 완료 이메일을 받으면 등록이 완료됩니다.',
        ],
        registrationLink: '등록 이메일 열기',
        registrationAddressLabel: '등록 이메일 주소',
        senderAddressLabel: '수신 허용 발신 주소',
        emailNote:
          '수신 거부를 설정한 경우 등록 전에 위 발신 주소를 허용해 주세요. 표시된 주소는 작동하지 않는 데모용 값이며 실제 등록은 이루어지지 않습니다.',
        phoneHeading: '전화 음성 서비스',
        phoneDescription:
          '전용 번호로 전화하면 방재 행정 무선 방송 내용을 음성으로 확인할 수 있습니다.',
        phoneNumberLabel: '전화번호',
        demoSuffix: '（데모용）',
        phoneNote: '이 번호는 화면 확인용이며 실제 통화에는 연결되지 않습니다.',
        contactHeading: '문의',
        contactNote:
          '방재 행정 무선과 알림 서비스는 미래시 방재과로 문의해 주세요.',
        contactPhoneLabel: '전화',
        form: {
          heading: '방재 행정 무선 알림 등록',
          description: '빈 이메일을 보낼 필요가 없습니다. 아래 양식에 수신자 정보를 입력해 주세요.',
          name: '이름', email: '이메일 주소', emailHelp: '방재 행정 무선 이메일 알림 수신 주소입니다.',
          phone: '전화번호', phoneHelp: '자동 음성 전화 알림 수신 번호입니다.',
          consent: '방재 행정 무선 안내를 이메일과 자동 음성 전화로 수신하고 입력 정보를 알림 등록 관리에 이용하는 데 동의합니다.',
          required: '필수', submit: '방재 행정 무선 등록', submitting: '등록 중…',
          syncNote: '등록 정보는 ZAAD에 저장되며 관리 화면의 등록 대상 설정에 따라 Zoom 연락처 목록에 반영됩니다.',
          assignmentNote: '연락처 목록이 지정되지 않아도 ZAAD 등록은 완료됩니다. 이 화면에서는 캠페인을 시작하거나 자동 음성 전화를 걸지 않습니다.',
          validationTitle: '입력 내용을 확인해 주세요', validationMessage: '이름, 이메일 주소, 전화번호, 알림 동의는 모두 필수입니다.', nameValidationMessage: '이름을 입력해 주세요.',
          serverErrorTitle: '등록을 접수할 수 없습니다', serverErrorMessage: '잠시 후 다시 시도해 주세요. 입력 내용은 유지됩니다.',
          successTitle: '등록이 접수되었습니다(데모)', successMessage: '방재 행정 무선 알림 등록 정보를 저장했습니다. 연락처 목록 반영 상태는 미래시가 관리합니다.',
          registerAnother: '다른 연락처 등록',
        },
      },
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
      buildingGuide: '청사 안내',
      disasterRadio: '방재 무선',
      postalCode: '〒100-0001',
      address: '미래현 미래시 주오 1-2-3',
      tower: '미래 시티 타워',
      copyright: '© Mirai City. All Rights Reserved.',
    },
  },
};
