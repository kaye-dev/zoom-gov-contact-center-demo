import type { Locale } from "./dictionaries";
import type { DemoEntryCopy } from "../components/DemoEntry";
import type { AccessCopy } from "../access/AccessCodeForm";
import type { AccessSettingsCopy } from "../admin/maintenance-settings/AccessSettings";

export type SiteAccessDictionary = {
  frame: DemoEntryCopy;
  gate: AccessCopy & { rateLimit: string; unavailable: string };
  settings: AccessSettingsCopy;
  sites: { key: "lg" | "univ"; title: string; name: string; description: string }[];
};

export const siteAccessDictionaries: Record<Locale, SiteAccessDictionary> = {
  ja: {
    frame: { brand: "keien.dev", title: "デモを選択", description: "ご覧になりたい業種を選択してください。", footer: "このサイトは架空の自治体・大学を用いたデモです。", open: "デモを見る" },
    gate: { title: "認証コードを入力", description: "このデモは限定公開中です。\n案内された認証コードを入力してください。", code: "認証コード", helpTitle: "コードが分からない場合：", help: "デモの案内担当者へお問い合わせください。", submit: "デモを表示", busy: "確認中…", error: "認証コードを確認できませんでした。もう一度お試しください。", rateLimit: "試行回数の上限に達しました。15分ほど待ってから再度お試しください。", unavailable: "現在認証を利用できません。時間をおいて再度お試しください。" },
    settings: { discardTitle: "未保存の変更があります", discardDescription: "変更を破棄して設定対象を切り替えますか？", discard: "破棄して切り替える", cancel: "キャンセル", title: "限定公開", description: "閲覧できる方を認証コードで制限します。全体共通と業種別に設定できます。", scope: "設定対象", scopes: ["全体共通（入口・自治体・大学）", "自治体 — 未来市", "大学 — 未来大学"], public: "公開", restricted: "限定公開", state: "公開範囲", code: "認証コード", codeHelp: "新しく設定する場合のみ入力してください（半角英数字8〜64文字）。変更すると、認証済みの閲覧者にも再入力を求めます。", duration: "認証の有効日数", durationHelp: "1日＝24時間。認証した時点からの有効日数を指定します。ブラウザーの保存期間によっては、期限前に再入力が必要です。", impact: "限定公開中は、この範囲への外部からの予約API・Webhook受付を停止します。管理画面からの発信・同期は引き続き利用できます。", save: "限定公開設定を保存", saving: "保存中…", saved: "限定公開設定を保存しました。", close: "閉じる", error: "設定を保存できませんでした。認証コードと有効日数を確認してください。", readonly: "この設定を変更する権限がありません。", loadError: "設定を取得できませんでした。再読み込みしてください。", reload: "再読み込み", conflict: "別の操作で設定が更新されました。入力内容を確認してから再読み込みしてください。" },
    sites: [{ key: "lg", title: "自治体", name: "未来市", description: "暮らしの情報や行政手続き、AI・電話による相談を体験できます。" }, { key: "univ", title: "大学", name: "未来大学", description: "入学・学生生活の情報や、チャット・音声・ビデオによる相談を体験できます。" }],
  },
  en: {
    frame: { brand: "keien.dev", title: "Choose a demo", description: "Select the sector you would like to explore.", footer: "This demo uses a fictional municipality and university.", open: "Open demo" },
    gate: { title: "Enter your access code", description: "This demo has restricted access.\nEnter the access code you were given.", code: "Access code", helpTitle: "Don't know the code?", help: "Contact the person who invited you to the demo.", submit: "View demo", busy: "Checking…", error: "We could not verify the access code. Please try again.", rateLimit: "Too many attempts. Please wait about 15 minutes and try again.", unavailable: "Verification is currently unavailable. Please try again later." },
    settings: { discardTitle: "Unsaved changes", discardDescription: "Discard your changes and switch scope?", discard: "Discard and switch", cancel: "Cancel", title: "Restricted access", description: "Limit viewing with an access code. Configure shared and sector-specific settings independently.", scope: "Scope", scopes: ["Shared (entry, municipality, university)", "Municipality — Mirai City", "University — Mirai University"], public: "Public", restricted: "Restricted", state: "Visibility", code: "Access code", codeHelp: "Enter a new code only when setting or changing it (8–64 ASCII letters and digits). Changing it requires previously authenticated visitors to sign in again.", duration: "Validity in days", durationHelp: "One day is 24 hours, starting at authentication. Browser storage limits may require visitors to enter the code earlier.", impact: "Restricted access stops external booking API and webhook intake for this scope. Calls and synchronization from the admin area remain available.", save: "Save access settings", saving: "Saving…", saved: "Access settings saved.", close: "Close", error: "Could not save settings. Check the access code and validity period.", readonly: "You do not have permission to change these settings.", loadError: "Could not load settings. Please reload.", reload: "Reload", conflict: "Another operation updated these settings. Review your input before reloading." },
    sites: [{ key: "lg", title: "Municipality", name: "Mirai City", description: "Explore local information, public services, and AI and telephone consultations." }, { key: "univ", title: "University", name: "Mirai University", description: "Explore admissions, student life, and chat, voice and video consultations." }],
  },
  "zh-Hans": {
    frame: { brand: "keien.dev", title: "选择演示", description: "请选择您想了解的行业。", footer: "本网站使用虚构的自治体和大学进行演示。", open: "查看演示" },
    gate: { title: "输入访问码", description: "此演示仅限受邀人员访问。\n请输入收到的访问码。", code: "访问码", helpTitle: "不知道访问码？", help: "请联系邀请您观看演示的负责人。", submit: "查看演示", busy: "验证中…", error: "无法验证访问码。请重试。", rateLimit: "尝试次数已达上限。请等待约15分钟后重试。", unavailable: "目前无法进行验证。请稍后重试。" },
    settings: { discardTitle: "有未保存的更改", discardDescription: "要放弃更改并切换设置范围吗？", discard: "放弃并切换", cancel: "取消", title: "限制访问", description: "通过访问码限制浏览。可分别设置全局和各行业范围。", scope: "设置范围", scopes: ["全局（入口、自治体、大学）", "自治体 — 未来市", "大学 — 未来大学"], public: "公开", restricted: "限制访问", state: "公开范围", code: "访问码", codeHelp: "仅在新设或更改时输入（8至64个半角英文字母或数字）。更改后，已验证的访客也需要重新输入。", duration: "验证有效天数", durationHelp: "1天为24小时，从验证时开始计算。浏览器的存储期限可能导致提前要求重新输入。", impact: "限制访问期间，将停止接收此范围的外部预约API和Webhook。管理界面的呼叫与同步仍可使用。", save: "保存访问设置", saving: "保存中…", saved: "已保存访问设置。", close: "关闭", error: "无法保存设置。请检查访问码和有效天数。", readonly: "您无权更改此设置。", loadError: "无法加载设置。请重新加载。", reload: "重新加载", conflict: "其他操作已更新此设置。请检查输入后重新加载。" },
    sites: [{ key: "lg", title: "自治体", name: "未来市", description: "体验生活信息、行政服务以及AI和电话咨询。" }, { key: "univ", title: "大学", name: "未来大学", description: "体验入学及校园生活信息，以及聊天、语音和视频咨询。" }],
  },
  "zh-Hant": {
    frame: { brand: "keien.dev", title: "選擇示範", description: "請選擇您想了解的產業。", footer: "本網站使用虛構的自治體和大學進行示範。", open: "查看示範" },
    gate: { title: "輸入存取碼", description: "此示範僅限受邀人員存取。\n請輸入收到的存取碼。", code: "存取碼", helpTitle: "不知道存取碼？", help: "請聯絡邀請您觀看示範的負責人。", submit: "查看示範", busy: "驗證中…", error: "無法驗證存取碼。請重試。", rateLimit: "嘗試次數已達上限。請等待約15分鐘後重試。", unavailable: "目前無法進行驗證。請稍後重試。" },
    settings: { discardTitle: "有未儲存的變更", discardDescription: "要捨棄變更並切換設定範圍嗎？", discard: "捨棄並切換", cancel: "取消", title: "限制存取", description: "透過存取碼限制瀏覽。可分別設定全域和各產業範圍。", scope: "設定範圍", scopes: ["全域（入口、自治體、大學）", "自治體 — 未來市", "大學 — 未來大學"], public: "公開", restricted: "限制存取", state: "公開範圍", code: "存取碼", codeHelp: "僅在新設或變更時輸入（8至64個半形英文字母或數字）。變更後，已驗證的訪客也需要重新輸入。", duration: "驗證有效天數", durationHelp: "1天為24小時，從驗證時開始計算。瀏覽器的儲存期限可能導致提前要求重新輸入。", impact: "限制存取期間，將停止接收此範圍的外部預約API和Webhook。管理介面的通話與同步仍可使用。", save: "儲存存取設定", saving: "儲存中…", saved: "已儲存存取設定。", close: "關閉", error: "無法儲存設定。請檢查存取碼和有效天數。", readonly: "您無權變更此設定。", loadError: "無法載入設定。請重新載入。", reload: "重新載入", conflict: "其他操作已更新此設定。請檢查輸入後重新載入。" },
    sites: [{ key: "lg", title: "自治體", name: "未來市", description: "體驗生活資訊、行政服務以及AI和電話諮詢。" }, { key: "univ", title: "大學", name: "未來大學", description: "體驗入學及校園生活資訊，以及聊天、語音和視訊諮詢。" }],
  },
  ko: {
    frame: { brand: "keien.dev", title: "데모 선택", description: "살펴볼 분야를 선택하세요.", footer: "이 사이트는 가상의 지자체와 대학을 사용한 데모입니다.", open: "데모 보기" },
    gate: { title: "접근 코드 입력", description: "이 데모는 제한 공개 중입니다.\n안내받은 접근 코드를 입력하세요.", code: "접근 코드", helpTitle: "코드를 모르시나요?", help: "데모를 안내한 담당자에게 문의하세요.", submit: "데모 보기", busy: "확인 중…", error: "접근 코드를 확인하지 못했습니다. 다시 시도하세요.", rateLimit: "시도 횟수를 초과했습니다. 약 15분 후 다시 시도하세요.", unavailable: "현재 인증을 사용할 수 없습니다. 나중에 다시 시도하세요." },
    settings: { discardTitle: "저장하지 않은 변경 사항", discardDescription: "변경 사항을 버리고 설정 범위를 전환할까요?", discard: "버리고 전환", cancel: "취소", title: "제한 공개", description: "접근 코드로 열람을 제한합니다. 전체 공통 및 분야별로 독립 설정할 수 있습니다.", scope: "설정 범위", scopes: ["전체 공통(입구·지자체·대학)", "지자체 — 미라이시", "대학 — 미라이대학교"], public: "공개", restricted: "제한 공개", state: "공개 범위", code: "접근 코드", codeHelp: "새로 설정하거나 변경할 때만 입력하세요(영문자와 숫자 8~64자). 변경하면 이미 인증한 방문자도 다시 입력해야 합니다.", duration: "인증 유효 일수", durationHelp: "1일은 24시간이며 인증 시점부터 계산합니다. 브라우저 저장 기간에 따라 만료 전에 재입력이 필요할 수 있습니다.", impact: "제한 공개 중에는 이 범위의 외부 예약 API 및 Webhook 수신이 중단됩니다. 관리 화면의 발신 및 동기화는 계속 사용할 수 있습니다.", save: "공개 설정 저장", saving: "저장 중…", saved: "공개 설정을 저장했습니다.", close: "닫기", error: "설정을 저장하지 못했습니다. 접근 코드와 유효 일수를 확인하세요.", readonly: "이 설정을 변경할 권한이 없습니다.", loadError: "설정을 불러오지 못했습니다. 다시 불러오세요.", reload: "다시 불러오기", conflict: "다른 작업에서 설정을 변경했습니다. 입력 내용을 확인한 후 다시 불러오세요." },
    sites: [{ key: "lg", title: "지자체", name: "미라이시", description: "생활 정보, 행정 절차, AI 및 전화 상담을 체험할 수 있습니다." }, { key: "univ", title: "대학", name: "미라이대학교", description: "입학 및 학생 생활 정보와 채팅·음성·영상 상담을 체험할 수 있습니다." }],
  },
};
