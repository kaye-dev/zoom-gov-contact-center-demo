const params = new URLSearchParams(window.location.search);
const requestedTheme = params.get("theme") === "dark" ? "dark" : "light";
const state = params.get("state") || "default";
const page = document.body.dataset.page || "home";

document.documentElement.classList.toggle("dark", requestedTheme === "dark");
document.documentElement.classList.toggle("light", requestedTheme === "light");
document.documentElement.classList.toggle("scheme-dark", requestedTheme === "dark");
document.documentElement.classList.toggle("scheme-light", requestedTheme === "light");

const icon = (name, className = "h-7 w-7") => {
  const paths = {
    search: '<path d="m21 21-4.3-4.3m2.3-5.2a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/>',
    chat: '<path d="M5 5.5h14v10H9l-4 3v-13Z"/><path d="M8 9h8M8 12h5"/>',
    video: '<rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="m15.5 10 5-3v10l-5-3"/>',
    phone: '<path d="M7 3.5h3l1.3 4-2 1.6a15 15 0 0 0 5.6 5.6l1.6-2 4 1.3v3c0 2-1.5 3.5-3.5 3.5A13.5 13.5 0 0 1 3.5 7C3.5 5 5 3.5 7 3.5Z"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    book: '<path d="M4 5.5h6.5A3.5 3.5 0 0 1 14 9v10a3.5 3.5 0 0 0-3.5-3.5H4v-10Z"/><path d="M20 5.5h-2.5A3.5 3.5 0 0 0 14 9v10a3.5 3.5 0 0 1 3.5-3.5H20v-10Z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    warning: '<path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4m0 3h.01"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="${className}">${paths[name] || paths.arrow}</svg>`;
};

const consultationIllustration = (kind) => {
  const drawings = {
    admissions: `
      <path d="M45 128h150M62 128V69l58-31 58 31v59M82 82h76M89 128V91h25v37M126 91h25v37"/>
      <path d="M160 38h34v44h-34zM168 50h18M168 60h18M168 70h11"/>
      <circle cx="120" cy="58" r="6"/>`,
    student: `
      <path d="M38 63c24-5 49 1 72 18v54c-23-17-48-23-72-18V63ZM202 63c-24-5-49 1-72 18v54c23-17 48-23 72-18V63Z"/>
      <path d="M110 81c7 4 13 10 20 18M72 53l13-20 13 20M79 42h12M158 49a16 16 0 1 1 32 0c0 12-16 25-16 25s-16-13-16-25Z"/>
      <circle cx="174" cy="49" r="5"/>`,
    career: `
      <rect x="48" y="65" width="144" height="72" rx="8"/>
      <path d="M92 65V50c0-7 5-12 12-12h32c7 0 12 5 12 12v15M48 91c31 18 113 18 144 0M108 95h24v16h-24z"/>
      <path d="M79 39 67 27M161 39l12-12M120 28V13"/>`,
  };
  return `<svg aria-hidden="true" viewBox="0 0 240 160" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="h-36 w-full">${drawings[kind] || drawings.admissions}</svg>`;
};

const publicNav = [
  ["入学案内", "information.html?section=admissions"],
  ["履修・授業", "information.html?section=academics"],
  ["学生生活", "information.html?section=campus-life"],
  ["奨学金", "information.html?section=scholarships"],
  ["キャリア", "information.html?section=careers"],
  ["FAQ", "faq.html"],
  ["ニュース", "news.html"],
];

const linkClass = "cursor-pointer text-sm font-semibold text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";

function publicHeader() {
  const mobileOpen = state === "mobile-nav-open";
  return `
    <a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-white">本文へ移動</a>
    <header data-prototype-shell class="sticky top-0 z-50 border-t-4 border-primary-700 border-b border-line bg-surface-raised">
      <div class="mx-auto flex min-h-20 max-w-7xl items-center px-4 md:px-6">
        <a href="index.html" class="flex min-w-0 items-center gap-3 pr-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          <img src="university-mark.svg" alt="" width="48" height="48" class="h-11 w-11 shrink-0 rounded-md">
          <span class="min-w-0 leading-tight"><span class="block text-xl font-bold tracking-wide md:text-2xl">未来大学</span><span class="block text-[10px] font-semibold tracking-[0.18em] text-fg-muted">MIRAI UNIVERSITY</span></span>
        </a>
        <nav aria-label="主要ナビゲーション" class="ml-auto hidden items-center gap-5 xl:flex">
          ${publicNav.map(([label, href]) => `<a href="${href}" class="${linkClass}">${label}</a>`).join("")}
          <a href="consultation.html" class="cursor-pointer rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">オンライン相談</a>
        </nav>
        <div class="ml-auto flex items-center gap-1 xl:ml-5">
          <button type="button" data-theme-toggle aria-label="テーマを切り替える" class="hidden h-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex">${requestedTheme === "dark" ? "ライト" : "ダーク"}</button>
          <button type="button" aria-label="言語を選択" class="hidden h-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex">日本語</button>
          <button type="button" data-mobile-open aria-controls="mobile-menu" aria-expanded="${mobileOpen}" aria-label="メニューを開く" class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:hidden">${icon("menu")}</button>
        </div>
      </div>
    </header>
    <div id="mobile-menu" data-mobile-menu class="${mobileOpen ? "fixed" : "hidden"} inset-0 z-[70] xl:hidden">
      <button type="button" data-mobile-close aria-label="メニューを閉じる" class="absolute inset-0 cursor-default bg-black/45"></button>
      <div role="dialog" aria-modal="true" aria-label="主要ナビゲーション" class="absolute inset-y-0 right-0 flex h-dvh w-80 max-w-[86vw] flex-col border-l border-line bg-surface-raised shadow-2xl">
        <div class="flex h-20 items-center justify-between border-b border-line px-5"><span class="font-bold">未来大学メニュー</span><button type="button" data-mobile-close aria-label="メニューを閉じる" class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">${icon("close")}</button></div>
        <nav class="overflow-y-auto p-5"><ul class="divide-y divide-line-subtle">${publicNav.map(([label, href]) => `<li><a href="${href}" class="flex min-h-12 items-center justify-between py-3 font-semibold text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">${label}${icon("chevron", "h-5 w-5")}</a></li>`).join("")}</ul><a href="consultation.html" class="mt-6 flex min-h-12 items-center justify-center rounded-md bg-primary px-4 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">オンライン相談</a></nav>
      </div>
    </div>`;
}

function publicFooter() {
  return `<footer class="mt-auto border-t border-line bg-primary-50 text-fg dark:bg-surface-raised"><div class="mx-auto max-w-7xl px-5 py-10 md:px-8"><div class="grid gap-8 md:grid-cols-[1.2fr_1fr_1fr]"><div class="flex items-start gap-3"><img src="university-mark.svg" alt="" width="40" height="40" class="h-10 w-10 rounded-md"><div><p class="font-bold">未来大学</p><p class="mt-2 text-sm leading-6 text-fg-muted">学生一人ひとりの学びと生活を支える<br>学生支援ポータル</p></div></div><nav aria-label="大学案内"><p class="font-bold">大学案内</p><ul class="mt-3 space-y-2 text-sm text-fg-muted"><li><a href="information.html?section=campus-life" class="hover:text-accent hover:underline">キャンパス・アクセス</a></li><li><a href="news.html" class="hover:text-accent hover:underline">大学からのお知らせ</a></li><li><a href="faq.html" class="hover:text-accent hover:underline">よくある質問</a></li></ul></nav><nav aria-label="サポート"><p class="font-bold">サポート</p><ul class="mt-3 space-y-2 text-sm text-fg-muted"><li><a href="consultation.html" class="hover:text-accent hover:underline">オンライン相談</a></li><li><a href="admin-consultation.html" class="hover:text-accent hover:underline">管理画面</a></li><li><span>平日 9:00–17:00</span></li></ul></nav></div><p class="mt-8 border-t border-primary-200 pt-5 text-xs text-fg-muted dark:border-line">© MIRAI UNIVERSITY</p></div></footer>`;
}

function pageFrame(content) {
  return `${publicHeader()}<main id="main-content" class="flex-1">${content}</main>${publicFooter()}`;
}

const supportItems = [
  ["入学案内", "入試、出願、オープンキャンパス", "admissions", "book"],
  ["履修・授業", "履修登録、時間割、試験・成績", "academics", "book"],
  ["学生生活", "健康、住まい、課外活動", "campus-life", "check"],
  ["奨学金", "制度検索、申請、相談窓口", "scholarships", "check"],
  ["キャリア", "進路相談、求人、インターン", "careers", "arrow"],
  ["よくある質問", "学生から多い質問を分野別に確認", "faq", "chat"],
];

function homePage() {
  return pageFrame(`
    <section class="border-b border-primary-200 bg-primary-50 dark:border-line dark:bg-surface-raised"><div class="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[1.3fr_.7fr] lg:items-center"><div><p class="text-sm font-bold tracking-[0.12em] text-primary-700 dark:text-primary-300">STUDENT SUPPORT PORTAL</p><h1 class="mt-3 max-w-3xl text-3xl font-bold leading-tight text-fg md:text-5xl">学びたい。相談したい。<br class="hidden sm:block">その次の一歩を、ここから。</h1><p class="mt-5 max-w-2xl text-base leading-8 text-fg-muted md:text-lg">入学前から卒業後の進路まで、必要な情報と相談窓口を一つにまとめています。</p><div class="mt-8 flex flex-wrap gap-3"><a href="consultation.html" class="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">相談方法を選ぶ${icon("arrow", "h-5 w-5")}</a><a href="#support" class="inline-flex min-h-12 items-center gap-2 rounded-md border border-line bg-surface px-5 py-3 font-bold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">情報を探す${icon("search", "h-5 w-5")}</a></div></div><div class="border-l-4 border-primary-500 bg-surface px-6 py-6 dark:bg-surface"><p class="text-sm font-bold text-accent">本日のサポート</p><p class="mt-2 text-2xl font-bold">平日 9:00–17:00</p><p class="mt-3 text-sm leading-6 text-fg-muted">相談内容に合わせて、自動受付または担当部署へつながります。</p><a href="consultation.html?state=now-open" class="mt-5 inline-flex items-center gap-2 font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">今すぐ相談する${icon("chevron", "h-5 w-5")}</a></div></div></section>
    <section aria-labelledby="journey-title" class="mx-auto max-w-7xl px-5 py-10 md:px-8"><h2 id="journey-title" class="sr-only">学生支援の流れ</h2><ol class="grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line"><li class="flex gap-4 px-3 py-5 md:px-6"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">1</span><div><p class="font-bold">探す</p><p class="mt-1 text-sm leading-6 text-fg-muted">分野別に必要な情報を確認</p></div></li><li class="flex gap-4 border-t border-line px-3 py-5 md:border-t-0 md:px-6"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">2</span><div><p class="font-bold">相談する</p><p class="mt-1 text-sm leading-6 text-fg-muted">チャット・音声・ビデオを選択</p></div></li><li class="flex gap-4 border-t border-line px-3 py-5 md:border-t-0 md:px-6"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">3</span><div><p class="font-bold">担当につながる</p><p class="mt-1 text-sm leading-6 text-fg-muted">相談内容に合う窓口が対応</p></div></li></ol></section>
    <section id="support" aria-labelledby="support-title" class="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-bold text-accent">学生支援メニュー</p><h2 id="support-title" class="mt-2 text-2xl font-bold md:text-3xl">目的から情報を探す</h2></div><a href="faq.html" class="font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">よくある質問を見る</a></div><ul class="mt-8 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">${supportItems.map(([title, description, slug, iconName]) => `<li class="border-b border-r border-line"><a href="${slug === "faq" ? "faq.html" : `information.html?section=${slug}`}" class="group flex min-h-40 flex-col px-5 py-5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"><span class="text-accent">${icon(iconName)}</span><span class="mt-4 text-lg font-bold group-hover:text-accent">${title}</span><span class="mt-2 text-sm leading-6 text-fg-muted">${description}</span><span class="mt-auto flex justify-end pt-4 text-accent">${icon("arrow", "h-5 w-5")}</span></a></li>`).join("")}</ul></section>
    <section aria-labelledby="home-news-title" class="border-t border-line bg-surface-raised"><div class="mx-auto max-w-7xl px-5 py-12 md:px-8"><div class="flex items-end justify-between gap-4"><h2 id="home-news-title" class="text-2xl font-bold md:text-3xl">大学からのお知らせ</h2><a href="news.html" class="font-semibold text-accent hover:underline">すべて見る</a></div><ul class="mt-6 divide-y divide-line">${[["2026年9月2日","後期履修登録の日程について"],["2026年8月28日","秋学期の学生相談室開室予定"],["2026年8月20日","キャリア相談予約枠を追加しました"]].map(([date,title])=>`<li><a href="news.html" class="grid gap-2 py-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:grid-cols-[10rem_1fr]"><time class="text-sm text-fg-muted">${date}</time><span class="font-semibold">${title}</span></a></li>`).join("")}</ul></div></section>`);
}

const infoCopy = {
  admissions: ["入学案内", "出願から入学準備まで、未来大学で学び始めるための情報をご案内します。", [["入試・出願", "募集要項、出願資格、選抜日程を確認できます。"],["オープンキャンパス", "学部説明、模擬授業、キャンパスツアーを実施します。"],["入学手続き", "合格後の手続き、学費、入学前準備をご確認ください。"]]],
  academics: ["履修・授業", "学修計画、履修登録、授業と試験に関する情報をまとめています。", [["履修登録", "履修期間と登録手順を確認できます。"],["授業・時間割", "授業日程、休講・補講情報をご案内します。"],["試験・成績", "試験日程、成績確認、追試の手続きを確認できます。"]]],
  "campus-life": ["学生生活", "安心して学び、充実した大学生活を送るための支援情報です。", [["健康・学生相談", "保健室と学生相談室の利用方法をご案内します。"],["住まい・生活", "学生寮、住居紹介、生活上の相談窓口を確認できます。"],["課外活動", "クラブ・サークル、施設利用、学内イベントをご紹介します。"]]],
  scholarships: ["奨学金", "学びを経済面から支える制度と申請手続きを確認できます。", [["大学独自制度", "給付型・貸与型の学内制度をご案内します。"],["公的奨学金", "申込時期と必要書類を確認できます。"],["個別相談", "家計状況に応じた制度選びを学生支援課が支援します。"]]],
  careers: ["キャリア", "進路選択から就職活動まで、段階に応じた支援を行います。", [["キャリア相談", "担当アドバイザーとの個別相談を利用できます。"],["求人・インターン", "学内求人とインターンシップ情報を確認できます。"],["講座・イベント", "業界研究、応募書類、面接対策の講座を開催します。"]]],
};

function breadcrumbs(current) { return `<nav aria-label="パンくず" class="mb-8 text-sm text-fg-muted"><ol class="flex flex-wrap items-center gap-2"><li><a href="index.html" class="text-accent hover:underline">ホーム</a></li><li>${icon("chevron", "h-4 w-4")}</li><li aria-current="page" class="text-fg">${current}</li></ol></nav>`; }
function pageTitle(title, lead) { return `<header class="border-l-[6px] border-primary-700 bg-primary-50 px-5 py-5 dark:border-primary-400 dark:bg-surface-raised md:px-7 md:py-6"><h1 class="text-2xl font-bold leading-snug md:text-4xl">${title}</h1></header><p class="mt-6 max-w-4xl text-base leading-8 text-fg-muted">${lead}</p>`; }

function informationPage() {
  const section = params.get("section") || "admissions";
  const [title, lead, items] = infoCopy[section] || infoCopy.admissions;
  return pageFrame(`<div class="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">${breadcrumbs(title)}${pageTitle(title, lead)}<nav aria-label="ページ内目次" class="mt-10 border-y border-line py-5"><p class="font-bold">このページの内容</p><ul class="mt-3 grid gap-x-8 md:grid-cols-3">${items.map(([heading])=>`<li><a href="#${heading}" class="flex min-h-11 items-center gap-2 py-2 font-semibold text-accent hover:underline">${icon("chevron", "h-4 w-4 rotate-90")}${heading}</a></li>`).join("")}</ul></nav><div class="mt-12 max-w-5xl space-y-12">${items.map(([heading,description])=>`<section id="${heading}" class="scroll-mt-24"><h2 class="border-l-4 border-accent bg-surface-hover px-5 py-4 text-xl font-bold md:text-2xl">${heading}</h2><div class="px-5 py-6 md:px-6"><p class="leading-8 text-fg">${description}</p><a href="consultation.html?state=reserve" class="mt-5 inline-flex items-center gap-2 font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">この内容を相談する${icon("arrow", "h-5 w-5")}</a></div></section>`).join("")}</div></div>`);
}

function faqPage() {
  const open = state === "faq-open";
  const faqs = [["入試の募集要項はどこで確認できますか","入学案内の「入試・出願」から、最新年度の募集要項と選抜日程をご確認ください。"],["履修登録の期間を過ぎてしまいました","所属学部の教務窓口へ早めにご相談ください。状況に応じた手続きをご案内します。"],["奨学金について個別に相談できますか","学生支援課で相談できます。オンライン相談から「学生生活・奨学金」を選択してください。"],["キャリア相談は何年生から利用できますか","全学年で利用できます。早い段階からの相談も歓迎しています。"]];
  return pageFrame(`<div class="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">${breadcrumbs("よくある質問")}${pageTitle("よくある質問", "学生の皆さんから多く寄せられる質問を、分野別にご案内します。")}<div class="mt-10 max-w-5xl"><div class="border border-line bg-surface-raised px-4 py-4"><label for="faq-search" class="block text-sm font-bold">質問を検索</label><div class="relative mt-2"><span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted">${icon("search", "h-5 w-5")}</span><input id="faq-search" type="search" placeholder="例：履修登録、奨学金" class="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-fg outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"></div></div><section aria-labelledby="faq-list-title" class="mt-10"><h2 id="faq-list-title" class="text-xl font-bold md:text-2xl">よく見られている質問</h2><div class="mt-5 border-x border-b border-line">${faqs.map(([question,answer],index)=>`<details ${open && index===0 ? "open" : ""} class="group border-t border-line"><summary class="flex min-h-16 cursor-pointer list-none items-center gap-4 bg-surface-raised px-5 py-4 font-bold leading-7 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"><span class="flex-1"><span class="mr-2 text-accent">Q.</span>${question}</span><span class="text-accent transition-transform group-open:rotate-90">${icon("chevron", "h-5 w-5")}</span></summary><div class="border-t border-line-subtle bg-surface px-5 py-5 leading-8"><span class="mr-2 font-bold text-accent">A.</span>${answer}</div></details>`).join("")}</div></section></div></div>`);
}

function newsPage() {
  const news = [["2026年9月2日","教務","後期履修登録の日程について","9月14日から後期履修登録を開始します。"],["2026年8月28日","学生生活","秋学期の学生相談室開室予定","対面・オンライン相談の受付日程を更新しました。"],["2026年8月20日","キャリア","キャリア相談予約枠を追加しました","業界研究と応募書類に関する個別相談枠を追加しました。"],["2026年8月5日","奨学金","秋募集の奨学金説明会を開催します","申請要件と必要書類について説明します。"]];
  return pageFrame(`<div class="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">${breadcrumbs("ニュース")}${pageTitle("ニュース", "授業、学生生活、奨学金、キャリアに関する最新情報です。")}<section aria-labelledby="news-list-title" class="mt-12"><h2 id="news-list-title" class="sr-only">ニュース一覧</h2><ul class="grid border-l border-t border-line md:grid-cols-2">${news.map(([date,category,title,summary])=>`<li class="border-b border-r border-line"><a href="information.html?section=academics" class="group flex h-full flex-col px-5 py-6 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"><div class="flex flex-wrap items-center gap-3"><time class="text-sm text-fg-muted">${date}</time><span class="inline-flex whitespace-nowrap bg-primary-50 px-2 py-1 text-xs font-bold text-primary-800 dark:bg-surface-hover dark:text-primary-300">${category}</span></div><h2 class="mt-4 text-lg font-bold leading-7 group-hover:text-accent">${title}</h2><p class="mt-3 text-sm leading-6 text-fg-muted">${summary}</p><span class="mt-auto flex justify-end pt-5 text-accent">${icon("arrow", "h-5 w-5")}</span></a></li>`).join("")}</ul></section></div>`);
}

function consultationPage() {
  if (state === "reserve" || state === "chat-triggered") return reservationConsultation();
  if (["now-open", "now-mixed", "now-stale", "now-closed", "now-unconfigured"].includes(state)) return immediateConsultation();
  const consultationFaqs = [
    ["どちらの相談方法を選べばよいですか？", "希望日時を指定したい場合は「予約して相談」、営業時間内にすぐ担当者と話したい場合は「今すぐ相談」を選んでください。"],
    ["スマートフォンから利用できますか？", "パソコン、スマートフォン、タブレットから利用できます。安定した通信環境でご利用ください。"],
    ["相談内容はこのサイトに保存されますか？", "このサイトには保存されません。オンライン相談の会話データは大学の保持方針に従って管理されます。"],
  ];
  return pageFrame(`
    <div class="mx-auto w-full max-w-7xl px-5 py-10 md:px-8 md:py-14">
      ${breadcrumbs("オンライン相談")}
      ${pageTitle("オンライン相談", "相談したいタイミングと内容に合わせて、オンラインで利用できる相談方法を選べます。")}
      <section aria-labelledby="choose-title" class="mt-12">
        <h2 id="choose-title" class="text-2xl font-bold">相談方法を選ぶ</h2>
        <div class="mt-6 grid border-l border-t border-line md:grid-cols-2">
          <article class="flex flex-col border-b border-r border-line px-6 py-7">
            <span class="text-accent">${icon("chat", "h-10 w-10")}</span>
            <h3 class="mt-4 text-xl font-bold">予約して相談</h3>
            <p class="mt-3 leading-7 text-fg-muted">自動受付が相談種別、希望日時、学籍番号を確認し、担当部署へ引き継ぎます。</p>
            <ul class="mt-5 space-y-2 text-sm">
              <li class="flex gap-2">${icon("check", "h-5 w-5 shrink-0 text-accent")}チャットまたは音声で受付</li>
              <li class="flex gap-2">${icon("check", "h-5 w-5 shrink-0 text-accent")}5言語に対応</li>
            </ul>
            <div class="mt-auto pt-7"><a href="consultation.html?state=reserve" class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 font-bold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">予約相談を始める${icon("arrow", "h-5 w-5")}</a></div>
          </article>
          <article class="flex flex-col border-b border-r border-line px-6 py-7">
            <span class="text-accent">${icon("video", "h-10 w-10")}</span>
            <h3 class="mt-4 text-xl font-bold">今すぐ相談</h3>
            <p class="mt-3 leading-7 text-fg-muted">営業時間内は、相談内容に合う担当者へビデオで直接つながります。</p>
            <ul class="mt-5 space-y-2 text-sm">
              <li class="flex gap-2 font-semibold">${icon("clock", "h-5 w-5 shrink-0 text-accent")}平日 9:00–17:00</li>
              <li class="flex gap-2">${icon("check", "h-5 w-5 shrink-0 text-accent")}相談内容に合わせて3つの窓口から選択</li>
            </ul>
            <div class="mt-auto pt-7"><a href="consultation.html?state=now-open" class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 font-bold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">今すぐ相談へ進む${icon("arrow", "h-5 w-5")}</a></div>
          </article>
        </div>
      </section>
      <section aria-labelledby="consultation-flow-title" class="mt-14">
        <p class="text-sm font-bold text-accent">HOW IT WORKS</p>
        <h2 id="consultation-flow-title" class="mt-2 text-2xl font-bold">オンライン相談の流れ</h2>
        <ol class="mt-6 grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line">
          <li class="flex gap-4 px-4 py-6 md:px-6"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">1</span><div><h3 class="font-bold">相談方法を選ぶ</h3><p class="mt-2 text-sm leading-6 text-fg-muted">希望日時に合わせて、予約相談または今すぐ相談を選びます。</p></div></li>
          <li class="flex gap-4 border-t border-line px-4 py-6 md:border-t-0 md:px-6"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">2</span><div><h3 class="font-bold">相談内容を伝える</h3><p class="mt-2 text-sm leading-6 text-fg-muted">予約相談は自動受付へ回答し、今すぐ相談は3つの窓口から選びます。</p></div></li>
          <li class="flex gap-4 border-t border-line px-4 py-6 md:border-t-0 md:px-6"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">3</span><div><h3 class="font-bold">担当者へつながる</h3><p class="mt-2 text-sm leading-6 text-fg-muted">相談内容に合う担当部署がオンラインで対応します。</p></div></li>
        </ol>
      </section>
      <section aria-labelledby="before-consultation-title" class="mt-14">
        <h2 id="before-consultation-title" class="text-2xl font-bold">相談前にご確認ください</h2>
        <div class="mt-6 grid border-l border-t border-line md:grid-cols-3">
          <div class="border-b border-r border-line bg-primary-50 px-5 py-6 dark:bg-surface-raised md:px-6"><span class="text-accent">${icon("video", "h-8 w-8")}</span><h3 class="mt-3 font-bold">利用端末</h3><p class="mt-2 text-sm leading-6 text-fg-muted">パソコン、スマートフォン、タブレットから利用できます。</p></div>
          <div class="border-b border-r border-line bg-primary-50 px-5 py-6 dark:bg-surface-raised md:px-6"><span class="text-accent">${icon("check", "h-8 w-8")}</span><h3 class="mt-3 font-bold">通信環境</h3><p class="mt-2 text-sm leading-6 text-fg-muted">安定した通信環境と、周囲の音が入りにくい場所をご用意ください。</p></div>
          <div class="border-b border-r border-line bg-primary-50 px-5 py-6 dark:bg-surface-raised md:px-6"><span class="text-accent">${icon("book", "h-8 w-8")}</span><h3 class="mt-3 font-bold">予約相談の準備</h3><p class="mt-2 text-sm leading-6 text-fg-muted">相談種別、希望日時、8文字英数字の学籍番号を確認しておくとスムーズです。</p></div>
        </div>
      </section>
      <section aria-labelledby="consultation-faq-title" class="mt-14 w-full">
        <div class="flex flex-wrap items-end justify-between gap-3"><h2 id="consultation-faq-title" class="text-2xl font-bold">オンライン相談のよくある質問</h2><a href="faq.html" class="font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">すべてのFAQを見る</a></div>
        <div class="mt-6 border-x border-b border-line">${consultationFaqs.map(([question, answer]) => `<details class="group border-t border-line"><summary class="flex min-h-16 cursor-pointer list-none items-center gap-4 bg-surface-raised px-5 py-4 font-bold leading-7 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"><span class="flex-1"><span class="mr-2 text-accent">Q.</span>${question}</span><span class="text-accent transition-transform group-open:rotate-90">${icon("chevron", "h-5 w-5")}</span></summary><div class="border-t border-line-subtle bg-surface px-5 py-5 leading-8"><span class="mr-2 font-bold text-accent">A.</span>${answer}</div></details>`).join("")}</div>
      </section>
      <aside class="mt-10 border-l-4 border-primary-500 bg-primary-50 px-5 py-4 text-sm leading-6 dark:bg-surface-raised"><p class="font-bold">個人情報の取り扱い</p><p class="mt-1 text-fg-muted">このサイトは相談内容や学籍番号を保存しません。オンライン相談の会話データは大学の保持方針に従います。</p></aside>
    </div>`);
}

function reservationConsultation() {
  const triggered = state === "chat-triggered";
  return pageFrame(`<div class="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">${breadcrumbs("予約して相談")}${pageTitle("予約して相談", "自動受付が必要事項を確認し、内容に合う担当部署へ引き継ぎます。")}<ol class="mt-10 grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line"><li class="px-5 py-5"><p class="text-sm font-bold text-accent">STEP 1</p><p class="mt-2 font-bold">相談種別を選ぶ</p></li><li class="border-t border-line px-5 py-5 md:border-t-0"><p class="text-sm font-bold text-accent">STEP 2</p><p class="mt-2 font-bold">希望日時を伝える</p></li><li class="border-t border-line px-5 py-5 md:border-t-0"><p class="text-sm font-bold text-accent">STEP 3</p><p class="mt-2 font-bold">学籍番号を入力する</p></li></ol><section aria-labelledby="channel-title" class="mt-12"><h2 id="channel-title" class="text-2xl font-bold">利用する方法を選ぶ</h2><p class="mt-3 text-sm leading-6 text-fg-muted">学籍番号は8文字の英数字で入力します。姓・メールアドレスは確認しません。</p><div class="mt-6 grid border-l border-t border-line md:grid-cols-2"><article class="border-b border-r border-line px-6 py-6"><span class="text-accent">${icon("chat", "h-9 w-9")}</span><h3 class="mt-4 text-xl font-bold">チャットで受付</h3><p class="mt-3 text-sm leading-6 text-fg-muted">画面上で質問に答えながら予約相談を受け付けます。</p><button type="button" data-chat-launch class="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 font-bold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">チャットを開始${icon("arrow", "h-5 w-5")}</button></article><article class="border-b border-r border-line px-6 py-6"><span class="text-accent">${icon("phone", "h-9 w-9")}</span><h3 class="mt-4 text-xl font-bold">電話で受付</h3><p class="mt-3 text-sm leading-6 text-fg-muted">電話で質問に答え、担当部署への引き継ぎを依頼します。</p><button type="button" data-prototype-phone class="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 py-3 font-bold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">設定済み番号へ発信${icon("phone", "h-5 w-5")}</button></article></div><div class="mt-6 flex flex-wrap gap-2" aria-label="対応言語"><span class="border border-line px-3 py-1 text-sm">日本語</span><span class="border border-line px-3 py-1 text-sm">English</span><span class="border border-line px-3 py-1 text-sm">简体中文</span><span class="border border-line px-3 py-1 text-sm">繁體中文</span><span class="border border-line px-3 py-1 text-sm">한국어</span></div>${triggered ? '<p role="status" class="mt-6 border-l-4 border-primary-500 bg-primary-50 px-5 py-4 font-semibold dark:bg-surface-raised">チャットを起動しました。画面の案内に従ってください。</p>' : '<p data-chat-status role="status" class="sr-only"></p>'}</section></div>`);
}

function immediateConsultation() {
  const isOpen = ["now-open", "now-mixed", "now-stale"].includes(state);
  const isConfigured = state !== "now-unconfigured";
  const services = [
    ["入学・入試", "出願、選抜、入学手続き", "admissions"],
    ["学生生活・奨学金", "学修、生活、経済的支援", "student"],
    ["キャリア", "進路、就職、インターン", "career"],
  ];
  const body = isOpen && isConfigured ? `<section aria-labelledby="service-title" class="mt-12"><div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-bold text-accent">LIVE VIDEO SUPPORT</p><h2 id="service-title" class="mt-2 text-2xl font-bold">相談内容を選ぶ</h2></div><div class="text-right"><p class="max-w-xl text-sm leading-6 text-fg-muted">カテゴリを選ぶと、相談内容に合う担当窓口へつながります。</p><p aria-live="polite" class="mt-1 text-xs font-semibold text-fg-muted">${state === "now-stale" ? "接続状況を再確認しています" : "接続状況は15秒ごとに更新されます"}</p></div></div><div class="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">${services.map(([title,description,kind], index)=>{
    const status = state === "now-stale" ? "checking" : state === "now-mixed" && index === 1 ? "busy" : "ready";
    const statusLabel = status === "ready" ? "ただいま受付中" : status === "busy" ? "担当者は現在対応中" : "接続状況を確認中";
    const statusClass = status === "ready" ? "text-green-700 dark:text-green-300" : status === "busy" ? "text-fg-muted" : "text-amber-700 dark:text-amber-300";
    const dotClass = status === "ready" ? "bg-green-600" : status === "busy" ? "bg-fg-muted" : "bg-amber-500";
    const buttonClass = status === "ready" ? "cursor-pointer bg-primary text-white hover:bg-primary-900" : "cursor-not-allowed border border-line bg-surface-selected text-fg-muted";
    const buttonLabel = status === "ready" ? "ビデオ相談を開始" : status === "busy" ? "現在対応中" : "状況確認中";
    return `<article data-availability-status="${status}" class="flex min-h-[29rem] flex-col border border-line bg-surface-raised"><div class="flex min-h-52 items-center justify-center border-b border-primary-200 bg-primary-50 px-7 py-6 text-primary-700 dark:border-line dark:bg-surface-hover dark:text-primary-300">${consultationIllustration(kind)}</div><div class="flex flex-1 flex-col px-5 py-5"><div class="flex items-center gap-2 text-sm font-bold ${statusClass}"><span aria-hidden="true" class="h-2.5 w-2.5 rounded-full ${dotClass}"></span>${statusLabel}</div><h3 class="mt-3 text-xl font-bold">${title}</h3><p class="mt-2 text-sm leading-6 text-fg-muted">${description}</p><button type="button" ${status === "ready" ? "" : "disabled"} class="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-4 py-3 font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${buttonClass}">${icon(status === "ready" ? "video" : status === "busy" ? "phone" : "clock", "h-5 w-5")}${buttonLabel}</button></div></article>`;
  }).join("")}</div></section>` : `<section aria-labelledby="closed-title" class="mt-12 max-w-4xl border border-line bg-surface-raised px-6 py-8"><span class="text-accent">${icon(isConfigured ? "clock" : "warning", "h-10 w-10")}</span><h2 id="closed-title" class="mt-4 text-2xl font-bold">${isConfigured ? "現在は受付時間外です" : "オンライン相談は現在利用できません"}</h2><p class="mt-3 leading-7 text-fg-muted">${isConfigured ? "今すぐ相談の受付時間は平日 9:00–17:00です。受付時間内にもう一度アクセスしてください。" : "オンライン相談の接続設定が完了していないため、相談開始ボタンは表示していません。"}</p></section>`;
  return pageFrame(`<div class="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">${breadcrumbs("今すぐ相談")}${pageTitle("今すぐ相談", "相談内容に合う窓口へ、ビデオで直接つながります。")}<div class="mt-6 inline-flex items-center gap-2 border border-line bg-surface-raised px-4 py-2 text-sm font-bold">${icon("clock", "h-5 w-5 text-accent")}受付時間：平日 9:00–17:00</div>${body}</div>`);
}

function adminPage() {
  const saved = state === "admin-saved";
  const invalid = state === "admin-error";
  const adminNav = ["ダッシュボード","予約システム","ZAAD","ユーザー","ロール","電話管理","AIチャット管理","オンライン相談","Developer API","設定"];
  return `<div id="admin-shell" data-prototype-shell class="min-h-screen bg-surface text-fg lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]"><aside class="hidden min-w-0 flex-col border-r border-line bg-surface-raised lg:flex"><div class="flex h-[76px] items-center gap-3 px-4"><img src="university-mark.svg" alt="" class="h-9 w-9 rounded-md"><span class="font-bold">未来大学</span></div><nav aria-label="管理画面" class="space-y-1 px-3 py-3">${adminNav.map(label=>`<a href="admin-consultation.html" class="flex h-12 items-center rounded-lg px-3 text-sm font-semibold ${label === "オンライン相談" ? "bg-surface-selected text-accent" : "text-fg-muted hover:bg-surface-hover hover:text-fg"}">${label}</a>`).join("")}</nav><div class="mt-auto p-3"><button type="button" class="flex h-12 w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-sm font-semibold hover:bg-surface-hover"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">管</span>管理者</button></div></aside><div class="min-w-0"><header class="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-surface-raised px-4 lg:hidden"><span class="font-bold">未来大学</span><button type="button" aria-label="管理メニューを開く" class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-hover">${icon("menu")}</button></header><main class="w-full px-4 py-8 md:px-6 lg:pb-8 lg:pt-5"><div class="space-y-4"><div class="ml-1 max-w-5xl"><div class="flex items-center gap-2"><h1 class="text-2xl font-bold">オンライン相談管理</h1><button type="button" aria-label="オンライン相談管理の説明" class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">ⓘ</button></div></div><div class="-mx-4 overflow-x-auto border-b border-line px-4 md:-mx-6 md:px-6"><div role="tablist" aria-label="オンライン相談管理" class="flex min-w-max gap-8">${[["service-admissions","入学・入試"],["service-student","学生生活・奨学金"],["service-career","キャリア"]].map(([key,label],index)=>`<button id="${key}-tab" type="button" role="tab" aria-selected="${index===0}" class="cursor-pointer whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm ${index===0 ? "border-accent font-bold text-accent" : "border-transparent font-semibold text-fg-muted hover:text-fg"}">${label}</button>`).join("")}</div></div></div><form data-admin-form novalidate class="ml-1 mt-6 max-w-5xl space-y-6"><fieldset class="space-y-6"><legend class="sr-only">入学・入試の接続設定</legend><div><p class="text-lg font-bold">入学・入試</p><p class="mt-2 text-sm leading-6 text-fg-muted">オンライン相談サービスで発行した接続用Webタグを設定します。</p></div><div class="space-y-2"><label for="video-tag" class="block text-sm font-semibold">接続用Webタグ</label><textarea id="video-tag" rows="7" required aria-invalid="${invalid}" aria-describedby="video-tag-help${invalid ? " video-tag-error" : ""}" class="w-full resize-y rounded-md border ${invalid ? "border-red-600" : "border-line"} bg-surface px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent">${invalid ? "" : "設定済み（値は安全のためprototypeでは表示しません）"}</textarea><p id="video-tag-help" class="text-xs leading-5 text-fg-muted">仕様に適合する接続用Webタグだけを受け付けます。</p>${invalid ? '<p id="video-tag-error" role="alert" class="text-sm font-semibold text-red-700 dark:text-red-400">接続用Webタグを入力してください。</p>' : ""}</div><div class="space-y-2"><label for="video-memo" class="block text-sm font-semibold">管理メモ</label><textarea id="video-memo" rows="4" class="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent">大学入試相談窓口</textarea></div><div class="border-l-4 border-primary-500 bg-primary-50 px-4 py-3 text-sm leading-6 dark:bg-surface-raised"><p class="font-bold">保存範囲</p><p class="text-fg-muted">3種類すべてのオンライン相談設定を、この大学テナントに保存します。</p></div>${saved ? '<p role="status" class="border-l-4 border-green-600 bg-green-50 px-4 py-3 font-semibold text-green-900 dark:bg-surface-raised dark:text-green-300">未来大学のオンライン相談設定を保存しました。</p>' : ""}<button type="submit" class="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-primary px-6 py-3 font-bold text-white hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">設定を保存</button></fieldset></form></main></div></div>`;
}

const renderers = { home: homePage, information: informationPage, faq: faqPage, news: newsPage, consultation: consultationPage, admin: adminPage };
const appRoot = document.getElementById("app");
appRoot.className = "flex min-h-screen flex-col";
appRoot.innerHTML = (renderers[page] || homePage)();

document.querySelectorAll("[data-theme-toggle]").forEach((button) => button.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  params.set("theme", next);
  window.location.search = params.toString();
}));

const menu = document.querySelector("[data-mobile-menu]");
const openButton = document.querySelector("[data-mobile-open]");
const closeButtons = document.querySelectorAll("[data-mobile-close]");
if (menu && openButton) {
  const openMenu = () => { menu.classList.remove("hidden"); menu.classList.add("fixed"); openButton.setAttribute("aria-expanded", "true"); menu.querySelector("[data-mobile-close]")?.focus(); document.body.style.overflow = "hidden"; };
  const closeMenu = () => { menu.classList.add("hidden"); menu.classList.remove("fixed"); openButton.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; openButton.focus(); };
  openButton.addEventListener("click", openMenu);
  closeButtons.forEach((button) => button.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !menu.classList.contains("hidden")) closeMenu(); });
}

document.querySelector("[data-chat-launch]")?.addEventListener("click", () => {
  params.set("state", "chat-triggered");
  window.location.search = params.toString();
});

document.querySelector("[data-admin-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const tag = document.getElementById("video-tag");
  params.set("state", tag && !tag.value.trim() ? "admin-error" : "admin-saved");
  window.location.search = params.toString();
});

document.documentElement.dataset.ready = "true";
