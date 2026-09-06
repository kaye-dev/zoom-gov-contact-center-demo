import type { SiteLocale } from "@/lib/site-settings";

export type UniversitySectionKey =
  | "admissions"
  | "academics"
  | "campus-life"
  | "scholarships"
  | "careers";

export type UniversityContent = {
  siteName: string;
  siteNameRoman: string;
  portalLabel: string;
  nav: Record<UniversitySectionKey | "faq" | "news" | "consultation", string>;
  home: {
    title: string;
    lead: string;
    chooseConsultation: string;
    exploreSupport: string;
    todaySupport: string;
    todaySupportLead: string;
    journey: readonly [string, string, string];
    journeyLead: readonly [string, string, string];
    supportHeading: string;
    newsHeading: string;
  };
  sections: Record<UniversitySectionKey, { title: string; lead: string; items: readonly [string, string][] }>;
  faq: { title: string; lead: string; questions: readonly [string, string][] };
  news: { title: string; lead: string; articles: readonly [string, string, string][] };
  consultation: {
    title: string;
    lead: string;
    reserveTitle: string;
    reserveLead: string;
    reserveAction: string;
    instantTitle: string;
    instantLead: string;
    instantExtra: string;
    instantAction: string;
    flowTitle: string;
    beforeTitle: string;
    before: readonly [string, string][];
    faqTitle: string;
    privacyTitle: string;
    privacyLead: string;
    reserveChannelTitle: string;
    chatChannel: string;
    phoneChannel: string;
    chatStarted: string;
    hours: string;
    closed: string;
    unconfigured: string;
    services: readonly [string, string][];
    ready: string;
    busy: string;
    unavailable: string;
    unknown: string;
    launch: string;
    connectionTag: string;
  };
};

const ja: UniversityContent = {
  siteName: "未来大学", siteNameRoman: "MIRAI UNIVERSITY", portalLabel: "学生支援ポータル",
  nav: { admissions: "入学案内", academics: "履修・授業", "campus-life": "学生生活", scholarships: "奨学金", careers: "キャリア", faq: "FAQ", news: "ニュース", consultation: "オンライン相談" },
  home: { title: "学びたい。相談したい。\nその次の一歩を、ここから。", lead: "入学前から卒業後の進路まで、必要な情報と相談窓口を一つにまとめています。", chooseConsultation: "相談方法を選ぶ", exploreSupport: "情報を探す", todaySupport: "本日のサポート", todaySupportLead: "相談内容に合わせて、自動受付または担当部署へつながります。", journey: ["探す", "相談する", "担当につながる"], journeyLead: ["分野別に必要な情報を確認", "チャット・音声・ビデオを選択", "相談内容に合う窓口が対応"], supportHeading: "目的から情報を探す", newsHeading: "大学からのお知らせ" },
  sections: {
    admissions: { title: "入学案内", lead: "出願から入学準備まで、未来大学で学び始めるための情報をご案内します。", items: [["入試・出願", "募集要項、出願資格、選抜日程を確認できます。"], ["オープンキャンパス", "学部説明、模擬授業、キャンパスツアーを実施します。"], ["入学手続き", "合格後の手続き、学費、入学前準備をご確認ください。"]] },
    academics: { title: "履修・授業", lead: "学修計画、履修登録、授業と試験に関する情報をまとめています。", items: [["履修登録", "履修期間と登録手順を確認できます。"], ["授業・時間割", "授業日程、休講・補講情報をご案内します。"], ["試験・成績", "試験日程、成績確認、追試の手続きを確認できます。"]] },
    "campus-life": { title: "学生生活", lead: "安心して学び、充実した大学生活を送るための支援情報です。", items: [["健康・学生相談", "保健室と学生相談室の利用方法をご案内します。"], ["住まい・生活", "学生寮、住居紹介、生活上の相談窓口を確認できます。"], ["課外活動", "クラブ・サークル、施設利用、学内イベントをご紹介します。"]] },
    scholarships: { title: "奨学金", lead: "学びを経済面から支える制度と申請手続きを確認できます。", items: [["大学独自制度", "給付型・貸与型の学内制度をご案内します。"], ["公的奨学金", "申込時期と必要書類を確認できます。"], ["個別相談", "家計状況に応じた制度選びを学生支援課が支援します。"]] },
    careers: { title: "キャリア", lead: "進路選択から就職活動まで、段階に応じた支援を行います。", items: [["キャリア相談", "担当アドバイザーとの個別相談を利用できます。"], ["求人・インターン", "学内求人とインターンシップ情報を確認できます。"], ["講座・イベント", "業界研究、応募書類、面接対策の講座を開催します。"]] },
  },
  faq: { title: "よくある質問", lead: "学生から多く寄せられる質問を、分野別にご案内します。", questions: [["どちらの相談方法を選べばよいですか？", "希望日時を指定する場合は予約相談、営業時間内に担当窓口へつながりたい場合は今すぐ相談を選びます。"], ["スマートフォンから利用できますか？", "スマートフォン、タブレット、パソコンから利用できます。安定した通信環境をご用意ください。"], ["相談内容はこのサイトに保存されますか？", "このサイトには保存されません。オンライン相談の会話データは大学の保持方針に従って管理されます。"]] },
  news: { title: "ニュース", lead: "未来大学からの最新情報をお知らせします。", articles: [["2026年9月2日", "後期履修登録の日程について", "academics"], ["2026年8月28日", "秋学期の学生相談室開室予定", "campus-life"], ["2026年8月20日", "キャリア相談予約枠を追加しました", "careers"]] },
  consultation: { title: "オンライン相談", lead: "相談したいタイミングと内容に合わせて、オンラインで利用できる相談方法を選べます。", reserveTitle: "予約して相談", reserveLead: "自動受付が相談種別、希望日時、学籍番号を確認し、担当部署へ引き継ぎます。", reserveAction: "予約相談を始める", instantTitle: "今すぐ相談", instantLead: "営業時間内は、相談内容に合う担当者へビデオで直接つながります。", instantExtra: "相談内容に合わせて3つの窓口から選択", instantAction: "今すぐ相談へ進む", flowTitle: "オンライン相談の流れ", beforeTitle: "相談前にご確認ください", before: [["利用端末", "パソコン、スマートフォン、タブレットから利用できます。"], ["通信環境", "安定した通信環境と、周囲の音が入りにくい場所をご用意ください。"], ["予約相談の準備", "相談種別、希望日時、8文字英数字の学籍番号を確認しておくとスムーズです。"]], faqTitle: "オンライン相談のよくある質問", privacyTitle: "個人情報の取り扱い", privacyLead: "このサイトは相談内容や学籍番号を保存しません。オンライン相談の会話データは大学の保持方針に従います。", reserveChannelTitle: "利用する方法を選ぶ", chatChannel: "チャットで受付", phoneChannel: "電話で受付", chatStarted: "チャットを起動しました。画面の案内に従ってください。", hours: "受付時間：平日 9:00–17:00", closed: "現在は受付時間外です。受付時間内にもう一度アクセスしてください。", unconfigured: "オンライン相談の接続設定が完了していないため、相談開始ボタンは表示していません。", services: [["入学・入試", "出願、入学手続き、入試に関する相談"], ["学生生活・奨学金", "学生生活、健康、住まい、奨学金に関する相談"], ["キャリア", "就職、進学、インターンに関する相談"]], ready: "ただいま受付中", busy: "担当者は現在対応中", unavailable: "現在受付できません", unknown: "接続状況を確認中", launch: "ビデオ相談を開始", connectionTag: "接続用Webタグ" },
};

const localized = (siteName: string, portalLabel: string, homeTitle: string, lead: string): UniversityContent => ({
  ...ja,
  siteName,
  siteNameRoman: "MIRAI UNIVERSITY",
  portalLabel,
  home: { ...ja.home, title: homeTitle, lead },
});

export const univContent: Record<SiteLocale, UniversityContent> = {
  ja,
  en: localized("Mirai University", "Student Support Portal", "Learn. Ask.\nTake your next step here.", "From admission to career planning, find the information and support services you need in one place."),
  "zh-Hans": localized("未来大学", "学生支持门户", "学习、咨询。\n从这里迈出下一步。", "从入学到毕业后的职业规划，您需要的信息和咨询窗口都集中在这里。"),
  "zh-Hant": localized("未來大學", "學生支援入口", "學習、諮詢。\n從這裡邁出下一步。", "從入學到畢業後的職涯規劃，您需要的資訊與諮詢窗口都集中在這裡。"),
  ko: localized("미래대학교", "학생 지원 포털", "배우고, 상담하고.\n다음 한 걸음을 여기에서.", "입학부터 졸업 후 진로까지 필요한 정보와 상담 창구를 한곳에 모았습니다."),
};
