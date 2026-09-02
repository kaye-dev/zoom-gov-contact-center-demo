export type ZaadSection =
  | "residents"
  | "contactLists"
  | "settings"
  | "messages"
  | "campaigns"
  | "oneTime";

export type ZaadDictionary = {
  navLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  apiSettings: string;
  apiSettingsPermission: string;
  connection: {
    connected: string;
    checking: string;
    missing: string;
    scope: string;
    expired: string;
    outage: string;
  };
  sections: Record<ZaadSection, string>;
  common: {
    create: string;
    edit: string;
    delete: string;
    save: string;
    cancel: string;
    search: string;
    clear: string;
    loading: string;
    empty: string;
    failure: string;
    success: string;
    readOnly: string;
    required: string;
    previous: string;
    next: string;
    confirm: string;
    retry: string;
    close: string;
  };
  residents: {
    heading: string;
    description: string;
    register: string;
    csv: string;
    total: string;
    consented: string;
    synced: string;
    needsAttention: string;
    name: string;
    contact: string;
    consent: string;
    source: string;
    contactList: string;
    registeredAt: string;
    actions: string;
    createTitle: string;
    editTitle: string;
    deleteTitle: string;
    deleteDescription: string;
    email: string;
    phone: string;
    consentedValue: string;
    notConsentedValue: string;
    csvTitle: string;
    csvDescription: string;
    csvHelp: string;
    chooseFile: string;
    import: string;
    noAssignment: string;
    searchPlaceholder: string;
    syncPending: string;
    syncSynced: string;
    syncFailed: string;
    syncNotAssigned: string;
    syncNotEligible: string;
    sourceWeb: string;
    sourceAdmin: string;
    sourceCsv: string;
    csvResultTotal: string;
    csvResultCreated: string;
    csvResultDuplicates: string;
    csvErrorHeading: string;
    csvErrorRow: string;
    csvErrorField: string;
    csvErrorReason: string;
    csvFieldFile: string;
    csvFieldHeader: string;
    csvFieldRow: string;
    csvReasonRequired: string;
    csvReasonInvalidFormat: string;
    csvReasonInvalidValue: string;
    csvReasonTooLong: string;
    csvReasonControlCharacter: string;
    csvReasonEmpty: string;
    csvReasonTooLarge: string;
    csvReasonInvalidUtf8: string;
    csvReasonInvalidStructure: string;
    csvReasonInvalidHeader: string;
    csvReasonTooManyRows: string;
    formInvalid: string;
    csvFileRequired: string;
  };
  messages: {
    heading: string;
    description: string;
    create: string;
    list: string;
    name: string;
    body: string;
    language: string;
    voice: string;
    assetId: string;
    status: string;
    createTitle: string;
    editTitle: string;
    deleteTitle: string;
    deleteDescription: string;
    pending: string;
    synced: string;
    failed: string;
    formInvalid: string;
  };
  contactLists: {
    heading: string;
    description: string;
    create: string;
    current: string;
    name: string;
    descriptionLabel: string;
    contacts: string;
    updatedAt: string;
    createTitle: string;
    editTitle: string;
    deleteTitle: string;
    deleteDescription: string;
    formInvalid: string;
  };
  settings: {
    heading: string;
    description: string;
    assignment: string;
    noAssignment: string;
    save: string;
    futureOnly: string;
  };
  campaigns: {
    heading: string;
    description: string;
    name: string;
    method: string;
    status: string;
    contactList: string;
    details: string;
    start: string;
    pause: string;
    startTitle: string;
    pauseTitle: string;
    startDescription: string;
    pauseDescription: string;
    operationProfile: string;
  };
  oneTime: {
    heading: string;
    description: string;
    label: string;
    body: string;
    voice: string;
    baseCampaign: string;
    lists: string;
    residents: string;
    summary: string;
    estimated: string;
    review: string;
    confirmTitle: string;
    confirmDescription: string;
    acknowledgement: string;
    prepare: string;
    preflight: string;
    snapshotReady: string;
    snapshotPending: string;
    prepared: string;
    invalid: string;
    failure: string;
    resultUnknown: string;
    immutable: string;
    noSources: string;
    selection: string;
    duplicatesRemoved: string;
    uniqueRecipients: string;
    selectedLists: string;
    selectedResidents: string;
    messageContent: string;
    maskedCaller: string;
    queue: string;
    maxConcurrency: string;
    businessHours: string;
    retryPolicy: string;
    dncPolicy: string;
    alwaysRunning: string;
    enabled: string;
    disabled: string;
    expiresAt: string;
    prepareDoesNotSend: string;
    recipientRules: string;
    selectionReason: string;
  };
  errors: {
    generic: string;
    permission: string;
    zoomContract: string;
    zoomMissing: string;
    zoomScope: string;
    zoomCredentials: string;
    rateLimited: string;
    transient: string;
    conflict: string;
    resultUnknown: string;
    notFound: string;
    invalid: string;
    resourceInUse: string;
    messageBodyRequiresShortening: string;
    authenticationRequired: string;
    passwordChangeRequired: string;
  };
};

export const zaadDictionaries: Record<
  "ja" | "en" | "zh-Hans" | "zh-Hant" | "ko",
  ZaadDictionary
> = {
  ja: {
    navLabel: "ZAAD",
    eyebrow: "Zoom Agentless Auto Dialer",
    title: "ZAAD",
    description:
      "防災行政無線の登録住民、TTS発信メッセージ、Zoom Contact Centerの連絡先リスト、定型キャンペーンと単発キャンペーンを管理します。",
    apiSettings: "Developer API設定",
    apiSettingsPermission:
      "Developer APIの閲覧権限がないため、設定画面は利用できません。",
    connection: {
      connected: "Zoom API 接続済み",
      checking: "Zoom API 確認中",
      missing: "Zoom API 未設定",
      scope: "Zoom API 権限不足",
      expired: "Zoom API 認証切れ",
      outage: "Zoom API 接続エラー",
    },
    sections: {
      residents: "住民",
      contactLists: "連絡リスト",
      settings: "登録設定",
      messages: "発信メッセージ",
      campaigns: "定型キャンペーン",
      oneTime: "単発キャンペーン",
    },
    common: {
      create: "作成",
      edit: "編集",
      delete: "削除",
      save: "保存",
      cancel: "キャンセル",
      search: "検索",
      clear: "クリア",
      loading: "読み込み中…",
      empty: "表示するデータがありません。",
      failure: "処理に失敗しました。",
      success: "処理が完了しました。",
      readOnly: "この操作を行う権限がありません。",
      required: "必須",
      previous: "前へ",
      next: "次へ",
      confirm: "確認",
      retry: "再試行",
      close: "閉じる",
    },
    residents: {
      heading: "防災行政無線の登録住民",
      description:
        "登録情報の確認、編集、削除と、画面・CSVからの新規登録ができます。",
      register: "住民を登録",
      csv: "CSVで一括登録",
      total: "登録住民",
      consented: "同意済み",
      synced: "Zoom同期済み",
      needsAttention: "同期確認が必要",
      name: "氏名",
      contact: "連絡先",
      consent: "同意",
      source: "登録経路",
      contactList: "連絡先リスト",
      registeredAt: "登録日時",
      actions: "操作",
      createTitle: "住民を登録",
      editTitle: "住民情報を編集",
      deleteTitle: "住民情報を削除",
      deleteDescription:
        "Zoomの連絡先を先に削除してから、ZAADの住民情報を削除します。",
      email: "メールアドレス",
      phone: "電話番号",
      consentedValue: "同意済み",
      notConsentedValue: "未同意",
      csvTitle: "CSVで住民を一括登録",
      csvDescription: "全行を検証し、問題がない場合だけ登録します。",
      csvHelp:
        "UTF-8、固定ヘッダー name,email,phone,consent_status、最大1 MiB・1,000行",
      chooseFile: "CSVファイル",
      import: "一括登録",
      noAssignment: "割り当てなし",
      searchPlaceholder: "氏名、メールアドレス、電話番号で検索",
      syncPending: "同期中",
      syncSynced: "同期済み",
      syncFailed: "同期失敗",
      syncNotAssigned: "ZAADのみ",
      syncNotEligible: "同期対象外",
      sourceWeb: "Web",
      sourceAdmin: "管理画面",
      sourceCsv: "CSV",
      csvResultTotal: "総行数",
      csvResultCreated: "登録件数",
      csvResultDuplicates: "重複スキップ",
      csvErrorHeading: "CSVの問題",
      csvErrorRow: "行",
      csvErrorField: "項目",
      csvErrorReason: "理由",
      csvFieldFile: "ファイル",
      csvFieldHeader: "ヘッダー",
      csvFieldRow: "行全体",
      csvReasonRequired: "必須項目が未入力です。",
      csvReasonInvalidFormat: "形式が正しくありません。",
      csvReasonInvalidValue: "許可されていない値です。",
      csvReasonTooLong: "文字数の上限を超えています。",
      csvReasonControlCharacter: "使用できない制御文字が含まれています。",
      csvReasonEmpty: "データ行がありません。",
      csvReasonTooLarge: "ファイルサイズの上限を超えています。",
      csvReasonInvalidUtf8: "UTF-8として読み取れません。",
      csvReasonInvalidStructure: "CSVの構造が正しくありません。",
      csvReasonInvalidHeader: "ヘッダーが指定形式と一致しません。",
      csvReasonTooManyRows: "データ行数の上限を超えています。",
      formInvalid:
        "氏名、メールアドレス、電話番号、同意状況を確認してください。",
      csvFileRequired: "登録するCSVファイルを選択してください。",
    },
    messages: {
      heading: "TTS発信メッセージ",
      description:
        "Zoom Contact Center Asset Libraryへ同期する音声メッセージを管理します。",
      create: "メッセージを作成",
      list: "メッセージ一覧",
      name: "名称",
      body: "読み上げ本文",
      language: "言語",
      voice: "音声",
      assetId: "Zoom Asset ID",
      status: "同期状態",
      createTitle: "発信メッセージを作成",
      editTitle: "発信メッセージを編集",
      deleteTitle: "発信メッセージを削除",
      deleteDescription: "Zoom側の利用状況を確認してから削除します。",
      pending: "同期待ち",
      synced: "Zoom同期済み",
      failed: "同期失敗",
      formInvalid: "名称、読み上げ本文、音声を確認してください。",
    },
    contactLists: {
      heading: "キャンペーン連絡先リスト",
      description:
        "Zoom Contact Centerの連絡先リストを表示・作成・編集・削除します。",
      create: "連絡先リストを作成",
      current: "現在の登録先",
      name: "リスト名",
      descriptionLabel: "説明",
      contacts: "連絡先",
      updatedAt: "更新日時",
      createTitle: "連絡先リストを作成",
      editTitle: "連絡先リストを編集",
      deleteTitle: "連絡先リストを削除",
      deleteDescription:
        "登録先または単発キャンペーンから参照中のリストは削除できません。",
      formInvalid: "リスト名と説明を確認してください。",
    },
    settings: {
      heading: "公開フォームの登録設定",
      description: "同意済みの新規住民を同期するZoom連絡先リストを選択します。",
      assignment: "新規登録先",
      noAssignment: "割り当てなし（ZAADのみに登録）",
      save: "登録設定を保存",
      futureOnly:
        "変更は今後の新規登録と、未同意から同意済みへ変更した住民だけに適用されます。",
    },
    campaigns: {
      heading: "定型キャンペーン",
      description:
        "Agentless Dialerキャンペーンの状態を確認し、開始または一時停止します。",
      name: "キャンペーン名",
      method: "発信方式",
      status: "状態",
      contactList: "連絡先リスト",
      details: "詳細",
      start: "開始",
      pause: "一時停止",
      startTitle: "キャンペーンを開始",
      pauseTitle: "キャンペーンを一時停止",
      startDescription:
        "確認後にZoomの状態をRunningへ変更し、自動音声電話の発信を開始します。",
      pauseDescription:
        "Zoomの状態をPausedへ変更します。未発信の連絡先が残る場合があります。",
      operationProfile: "発信設定",
    },
    oneTime: {
      heading: "単発キャンペーン",
      description:
        "突発的な案内の本文と発信対象を指定し、今回限りのAgentless DialerキャンペーンをReadyまで準備します。",
      label: "管理用名称",
      body: "読み上げ本文",
      voice: "音声",
      baseCampaign: "参照する定型キャンペーン",
      lists: "連絡先リスト",
      residents: "個別の住民",
      summary: "発信対象の概要",
      estimated: "選択中の概算件数",
      review: "内容と発信対象を確認",
      confirmTitle: "単発キャンペーンの準備を確認",
      confirmDescription:
        "serverが確定した対象件数と発信設定を確認してください。準備だけでは発信しません。",
      acknowledgement:
        "本文、発信対象、発信設定を確認し、準備後は変更できず、準備だけでは発信されないことを理解しました。",
      prepare: "Readyまで準備",
      preflight: "発信対象を確認中…",
      snapshotReady: "5分間有効な確認結果を取得しました。",
      snapshotPending: "確認結果を取得しています。",
      prepared: "準備が完了しました。開始は定型キャンペーンから行います。",
      invalid: "本文と発信対象を確認してください。",
      failure: "準備に失敗しました。自動再送は行いません。",
      resultUnknown:
        "Zoom側の結果を確認できません。Zoom Webポータルで状態を確認してください。",
      immutable:
        "準備完了後の本文、発信対象、一時リスト、音声アセットは変更できません。",
      noSources: "連絡先リストまたは同意済み住民を1件以上選択してください。",
      selection: "選択内容",
      duplicatesRemoved: "重複除外",
      uniqueRecipients: "発信対象",
      selectedLists: "選択リスト",
      selectedResidents: "個別住民",
      messageContent: "読み上げ内容",
      maskedCaller: "発信元番号",
      queue: "キュー",
      maxConcurrency: "最大同時発信",
      businessHours: "発信時間",
      retryPolicy: "再試行",
      dncPolicy: "DNC",
      alwaysRunning: "常時実行",
      enabled: "有効",
      disabled: "無効",
      expiresAt: "確認期限",
      prepareDoesNotSend: "準備完了だけでは発信されません。",
      recipientRules:
        "各リストの全連絡先を取得し、電話番号をE.164へ正規化して重複を除外します。重複除外後の上限は1,000件です。",
      selectionReason: "読み上げ本文と1件以上の対象を選択してください。",
    },
    errors: {
      generic: "処理に失敗しました。時間をおいて再度お試しください。",
      permission: "この操作を行う権限がありません。",
      zoomContract:
        "Zoom sandboxの書き込み契約が未確認です。確認が完了するまでこの操作は利用できません。",
      zoomMissing:
        "Zoom APIが設定されていません。権限のある管理者がDeveloper API設定を確認してください。",
      zoomScope:
        "Zoom APIの権限が不足しています。権限のある管理者が必要なscopeを確認してください。",
      zoomCredentials:
        "Zoom APIの認証情報を確認できません。権限のある管理者がDeveloper API設定を更新してください。",
      rateLimited:
        "Zoom APIの利用上限に達しました。しばらく待ってから再試行してください。",
      transient:
        "Zoom APIとの通信が一時的に不安定です。しばらく待ってから再試行してください。",
      conflict:
        "別の更新が反映されています。最新情報を再読み込みしてからやり直してください。",
      resultUnknown:
        "Zoom側の処理結果を確認できません。操作を再送せず、Zoom WebポータルとZAADの最新状態を照合してください。",
      notFound: "対象が見つかりません。最新情報を再読み込みしてください。",
      invalid: "入力または選択内容を確認してからやり直してください。",
      resourceInUse:
        "Zoomで使用中のため処理できません。Zoom Webポータルで参照を解除してからやり直してください。",
      messageBodyRequiresShortening:
        "読み上げ本文が500文字を超えています。500文字以内に短縮して保存してから再試行してください。",
      authenticationRequired:
        "ログイン状態を確認できません。再度ログインしてください。",
      passwordChangeRequired: "操作を続ける前にパスワードを変更してください。",
    },
  },
  en: {
    navLabel: "ZAAD",
    eyebrow: "Zoom Agentless Auto Dialer",
    title: "ZAAD",
    description:
      "Manage disaster radio residents, TTS outbound messages, Zoom Contact Center contact lists, recurring campaigns, and one-time campaigns.",
    apiSettings: "Developer API settings",
    apiSettingsPermission:
      "Developer API settings are unavailable because you do not have permission to view them.",
    connection: {
      connected: "Zoom API connected",
      checking: "Checking Zoom API",
      missing: "Zoom API not configured",
      scope: "Zoom API permission required",
      expired: "Zoom API authentication expired",
      outage: "Zoom API connection error",
    },
    sections: {
      residents: "Residents",
      contactLists: "Contact Lists",
      settings: "Registration Settings",
      messages: "Outbound Messages",
      campaigns: "Recurring Campaigns",
      oneTime: "One-time Campaigns",
    },
    common: {
      create: "Create",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      search: "Search",
      clear: "Clear",
      loading: "Loading…",
      empty: "No data to display.",
      failure: "The operation failed.",
      success: "The operation completed.",
      readOnly: "You do not have permission for this action.",
      required: "Required",
      previous: "Previous",
      next: "Next",
      confirm: "Confirm",
      retry: "Retry",
      close: "Close",
    },
    residents: {
      heading: "Disaster radio residents",
      description:
        "Review, edit, delete, or add residents individually or by CSV.",
      register: "Register resident",
      csv: "Bulk register CSV",
      total: "Registered residents",
      consented: "Consented",
      synced: "Synced with Zoom",
      needsAttention: "Sync needs attention",
      name: "Name",
      contact: "Contact",
      consent: "Consent",
      source: "Registration source",
      contactList: "Contact list",
      registeredAt: "Registered",
      actions: "Actions",
      createTitle: "Register resident",
      editTitle: "Edit resident",
      deleteTitle: "Delete resident",
      deleteDescription:
        "The Zoom contact is deleted before the resident record in ZAAD.",
      email: "Email address",
      phone: "Phone number",
      consentedValue: "Consented",
      notConsentedValue: "Not consented",
      csvTitle: "Bulk register residents by CSV",
      csvDescription:
        "All rows are validated before any resident is registered.",
      csvHelp:
        "UTF-8, fixed header name,email,phone,consent_status, up to 1 MiB and 1,000 rows",
      chooseFile: "CSV file",
      import: "Import",
      noAssignment: "No assignment",
      searchPlaceholder: "Search by name, email, or phone",
      syncPending: "Syncing",
      syncSynced: "Synced",
      syncFailed: "Sync failed",
      syncNotAssigned: "ZAAD only",
      syncNotEligible: "Not eligible",
      sourceWeb: "Web",
      sourceAdmin: "Admin",
      sourceCsv: "CSV",
      csvResultTotal: "Total rows",
      csvResultCreated: "Residents created",
      csvResultDuplicates: "Duplicates skipped",
      csvErrorHeading: "CSV issues",
      csvErrorRow: "Row",
      csvErrorField: "Field",
      csvErrorReason: "Reason",
      csvFieldFile: "File",
      csvFieldHeader: "Header",
      csvFieldRow: "Entire row",
      csvReasonRequired: "A required value is missing.",
      csvReasonInvalidFormat: "The format is invalid.",
      csvReasonInvalidValue: "The value is not allowed.",
      csvReasonTooLong: "The value exceeds the length limit.",
      csvReasonControlCharacter:
        "The value contains an unsupported control character.",
      csvReasonEmpty: "The file has no data rows.",
      csvReasonTooLarge: "The file exceeds the size limit.",
      csvReasonInvalidUtf8: "The file is not valid UTF-8.",
      csvReasonInvalidStructure: "The CSV structure is invalid.",
      csvReasonInvalidHeader: "The header does not match the required format.",
      csvReasonTooManyRows: "The file exceeds the row limit.",
      formInvalid:
        "Review the name, email address, phone number, and consent status.",
      csvFileRequired: "Choose the CSV file to register.",
    },
    messages: {
      heading: "TTS outbound messages",
      description:
        "Manage voice messages synchronized with the Zoom Contact Center Asset Library.",
      create: "Create message",
      list: "Message list",
      name: "Name",
      body: "Text to speak",
      language: "Language",
      voice: "Voice",
      assetId: "Zoom Asset ID",
      status: "Sync status",
      createTitle: "Create outbound message",
      editTitle: "Edit outbound message",
      deleteTitle: "Delete outbound message",
      deleteDescription: "Zoom usage is checked before deletion.",
      pending: "Pending",
      synced: "Synced with Zoom",
      failed: "Sync failed",
      formInvalid: "Review the name, text to speak, and voice.",
    },
    contactLists: {
      heading: "Campaign contact lists",
      description:
        "View, create, edit, and delete Zoom Contact Center contact lists.",
      create: "Create contact list",
      current: "Current registration target",
      name: "List name",
      descriptionLabel: "Description",
      contacts: "Contacts",
      updatedAt: "Updated",
      createTitle: "Create contact list",
      editTitle: "Edit contact list",
      deleteTitle: "Delete contact list",
      deleteDescription:
        "Lists referenced by registration settings or one-time campaigns cannot be deleted.",
      formInvalid: "Review the list name and description.",
    },
    settings: {
      heading: "Public form registration settings",
      description:
        "Choose the Zoom contact list used for newly consented residents.",
      assignment: "New registration target",
      noAssignment: "No assignment (register in ZAAD only)",
      save: "Save registration settings",
      futureOnly:
        "Changes apply only to new registrations and residents changing from not consented to consented.",
    },
    campaigns: {
      heading: "Recurring campaigns",
      description: "Review Agentless Dialer campaigns and start or pause them.",
      name: "Campaign name",
      method: "Dialing method",
      status: "Status",
      contactList: "Contact list",
      details: "Details",
      start: "Start",
      pause: "Pause",
      startTitle: "Start campaign",
      pauseTitle: "Pause campaign",
      startDescription:
        "After confirmation, Zoom changes to Running and begins automated voice calls.",
      pauseDescription: "Zoom changes to Paused. Uncalled contacts may remain.",
      operationProfile: "Dialing settings",
    },
    oneTime: {
      heading: "One-time campaigns",
      description:
        "Enter an urgent message and recipients, then prepare a one-use Agentless Dialer campaign through Ready.",
      label: "Administrative label",
      body: "Text to speak",
      voice: "Voice",
      baseCampaign: "Reference recurring campaign",
      lists: "Contact lists",
      residents: "Individual residents",
      summary: "Recipient summary",
      estimated: "Estimated selected count",
      review: "Review message and recipients",
      confirmTitle: "Confirm one-time campaign preparation",
      confirmDescription:
        "Review the recipients and dialing settings confirmed by the server. Preparation does not place calls.",
      acknowledgement:
        "I reviewed the message, recipients, and dialing settings and understand they cannot change after preparation and preparation does not place calls.",
      prepare: "Prepare through Ready",
      preflight: "Checking recipients…",
      snapshotReady: "A five-minute confirmation snapshot is ready.",
      snapshotPending: "Obtaining confirmation snapshot.",
      prepared: "Preparation completed. Start it from Recurring Campaigns.",
      invalid: "Check the message and recipients.",
      failure: "Preparation failed. It will not be retried automatically.",
      resultUnknown: "The Zoom result is unknown. Check the Zoom web portal.",
      immutable:
        "The message, recipients, temporary list, and audio asset cannot change after preparation.",
      noSources: "Select at least one contact list or consented resident.",
      selection: "Selection",
      duplicatesRemoved: "Duplicates removed",
      uniqueRecipients: "Unique recipients",
      selectedLists: "Selected lists",
      selectedResidents: "Individual residents",
      messageContent: "Message",
      maskedCaller: "Masked caller ID",
      queue: "Queue",
      maxConcurrency: "Max concurrent calls",
      businessHours: "Business hours",
      retryPolicy: "Retry policy",
      dncPolicy: "DNC policy",
      alwaysRunning: "Always running",
      enabled: "Enabled",
      disabled: "Disabled",
      expiresAt: "Confirmation expires",
      prepareDoesNotSend: "Completing preparation does not start calls.",
      recipientRules:
        "All contacts in each list are loaded, phone numbers are normalized to E.164, and duplicates are removed. The limit is 1,000 recipients after deduplication.",
      selectionReason:
        "Enter the text to speak and select at least one recipient source.",
    },
    errors: {
      generic: "The operation failed. Please try again later.",
      permission: "You do not have permission for this action.",
      zoomContract:
        "The Zoom sandbox write contract has not been verified. This operation remains unavailable until verification is complete.",
      zoomMissing:
        "The Zoom API is not configured. Ask an authorized administrator to check the Developer API settings.",
      zoomScope:
        "The Zoom API lacks a required scope. Ask an authorized administrator to review the app scopes.",
      zoomCredentials:
        "The Zoom API credentials could not be authenticated. Ask an authorized administrator to update the Developer API settings.",
      rateLimited:
        "The Zoom API rate limit was reached. Wait a moment, then retry.",
      transient:
        "The Zoom API is temporarily unavailable. Wait a moment, then retry.",
      conflict:
        "Another update was applied. Reload the latest data, then try again.",
      resultUnknown:
        "The Zoom result is unknown. Do not resubmit the operation; reconcile the latest state in the Zoom web portal and ZAAD.",
      notFound: "The requested item was not found. Reload the latest data.",
      invalid: "Review the input or selection, then try again.",
      resourceInUse:
        "Zoom is using this item. Remove its references in the Zoom web portal, then try again.",
      messageBodyRequiresShortening:
        "The message exceeds 500 characters. Shorten it to 500 characters or fewer, save it, then retry.",
      authenticationRequired:
        "Your session could not be verified. Sign in again.",
      passwordChangeRequired: "Change your password before continuing.",
    },
  },
  "zh-Hans": {
    navLabel: "ZAAD",
    eyebrow: "Zoom Agentless Auto Dialer",
    title: "ZAAD",
    description:
      "管理防灾行政无线登记居民、TTS外呼消息、Zoom Contact Center联系人列表、定期活动和单次活动。",
    apiSettings: "Developer API设置",
    apiSettingsPermission:
      "您没有Developer API的查看权限，因此无法使用设置页面。",
    connection: {
      connected: "Zoom API已连接",
      checking: "正在检查Zoom API",
      missing: "未设置Zoom API",
      scope: "Zoom API权限不足",
      expired: "Zoom API认证已过期",
      outage: "Zoom API连接错误",
    },
    sections: {
      residents: "居民",
      contactLists: "联系人列表",
      settings: "登记设置",
      messages: "外呼消息",
      campaigns: "定期活动",
      oneTime: "单次活动",
    },
    common: {
      create: "创建",
      edit: "编辑",
      delete: "删除",
      save: "保存",
      cancel: "取消",
      search: "搜索",
      clear: "清除",
      loading: "正在加载…",
      empty: "没有可显示的数据。",
      failure: "处理失败。",
      success: "处理已完成。",
      readOnly: "您没有执行此操作的权限。",
      required: "必填",
      previous: "上一页",
      next: "下一页",
      confirm: "确认",
      retry: "重试",
      close: "关闭",
    },
    residents: {
      heading: "防灾行政无线登记居民",
      description: "可查看、编辑、删除登记信息，并通过画面或CSV新增居民。",
      register: "登记居民",
      csv: "CSV批量登记",
      total: "登记居民",
      consented: "已同意",
      synced: "已同步Zoom",
      needsAttention: "需要确认同步",
      name: "姓名",
      contact: "联系方式",
      consent: "同意",
      source: "登记来源",
      contactList: "联系人列表",
      registeredAt: "登记时间",
      actions: "操作",
      createTitle: "登记居民",
      editTitle: "编辑居民信息",
      deleteTitle: "删除居民信息",
      deleteDescription: "先删除Zoom联系人，再删除ZAAD居民信息。",
      email: "电子邮件地址",
      phone: "电话号码",
      consentedValue: "已同意",
      notConsentedValue: "未同意",
      csvTitle: "使用CSV批量登记居民",
      csvDescription: "验证所有行，确认无误后才登记。",
      csvHelp:
        "UTF-8，固定表头 name,email,phone,consent_status，最大1 MiB、1,000行",
      chooseFile: "CSV文件",
      import: "批量登记",
      noAssignment: "未分配",
      searchPlaceholder: "按姓名、邮件或电话搜索",
      syncPending: "同步中",
      syncSynced: "已同步",
      syncFailed: "同步失败",
      syncNotAssigned: "仅ZAAD",
      syncNotEligible: "非同步对象",
      sourceWeb: "网页",
      sourceAdmin: "管理页面",
      sourceCsv: "CSV",
      csvResultTotal: "总行数",
      csvResultCreated: "登记数量",
      csvResultDuplicates: "跳过重复项",
      csvErrorHeading: "CSV问题",
      csvErrorRow: "行",
      csvErrorField: "字段",
      csvErrorReason: "原因",
      csvFieldFile: "文件",
      csvFieldHeader: "表头",
      csvFieldRow: "整行",
      csvReasonRequired: "缺少必填值。",
      csvReasonInvalidFormat: "格式不正确。",
      csvReasonInvalidValue: "值不在允许范围内。",
      csvReasonTooLong: "超出长度限制。",
      csvReasonControlCharacter: "包含不支持的控制字符。",
      csvReasonEmpty: "没有数据行。",
      csvReasonTooLarge: "文件超过大小限制。",
      csvReasonInvalidUtf8: "文件不是有效的UTF-8。",
      csvReasonInvalidStructure: "CSV结构不正确。",
      csvReasonInvalidHeader: "表头与指定格式不一致。",
      csvReasonTooManyRows: "数据行数超过限制。",
      formInvalid: "请检查姓名、电子邮件地址、电话号码和同意状态。",
      csvFileRequired: "请选择要登记的CSV文件。",
    },
    messages: {
      heading: "TTS外呼消息",
      description: "管理同步到Zoom Contact Center Asset Library的语音消息。",
      create: "创建消息",
      list: "消息列表",
      name: "名称",
      body: "朗读正文",
      language: "语言",
      voice: "语音",
      assetId: "Zoom Asset ID",
      status: "同步状态",
      createTitle: "创建外呼消息",
      editTitle: "编辑外呼消息",
      deleteTitle: "删除外呼消息",
      deleteDescription: "确认Zoom端使用状态后删除。",
      pending: "等待同步",
      synced: "已同步Zoom",
      failed: "同步失败",
      formInvalid: "请检查名称、朗读正文和语音。",
    },
    contactLists: {
      heading: "活动联系人列表",
      description: "显示、创建、编辑和删除Zoom Contact Center联系人列表。",
      create: "创建联系人列表",
      current: "当前登记目标",
      name: "列表名称",
      descriptionLabel: "说明",
      contacts: "联系人",
      updatedAt: "更新时间",
      createTitle: "创建联系人列表",
      editTitle: "编辑联系人列表",
      deleteTitle: "删除联系人列表",
      deleteDescription: "登记设置或单次活动正在引用的列表无法删除。",
      formInvalid: "请检查列表名称和说明。",
    },
    settings: {
      heading: "公开表单登记设置",
      description: "选择用于同步新登记且已同意居民的Zoom联系人列表。",
      assignment: "新登记目标",
      noAssignment: "未分配（仅登记到ZAAD）",
      save: "保存登记设置",
      futureOnly: "变更仅适用于今后的新登记，以及从未同意变为已同意的居民。",
    },
    campaigns: {
      heading: "定期活动",
      description: "确认Agentless Dialer活动状态并启动或暂停。",
      name: "活动名称",
      method: "外呼方式",
      status: "状态",
      contactList: "联系人列表",
      details: "详情",
      start: "启动",
      pause: "暂停",
      startTitle: "启动活动",
      pauseTitle: "暂停活动",
      startDescription: "确认后将Zoom状态改为Running并开始自动语音外呼。",
      pauseDescription: "将Zoom状态改为Paused。可能仍有未外呼的联系人。",
      operationProfile: "外呼设置",
    },
    oneTime: {
      heading: "单次活动",
      description:
        "输入突发通知正文和外呼对象，将一次性Agentless Dialer活动准备到Ready。",
      label: "管理名称",
      body: "朗读正文",
      voice: "语音",
      baseCampaign: "参考定期活动",
      lists: "联系人列表",
      residents: "个别居民",
      summary: "外呼对象概要",
      estimated: "当前估算数量",
      review: "确认正文和外呼对象",
      confirmTitle: "确认准备单次活动",
      confirmDescription:
        "请确认服务器确定的对象数量和外呼设置。准备本身不会发起呼叫。",
      acknowledgement:
        "我已确认正文、外呼对象和外呼设置，并理解准备后不可更改，且准备本身不会发起呼叫。",
      prepare: "准备到Ready",
      preflight: "正在确认外呼对象…",
      snapshotReady: "已取得有效期5分钟的确认结果。",
      snapshotPending: "正在取得确认结果。",
      prepared: "准备完成。请从定期活动启动。",
      invalid: "请检查正文和外呼对象。",
      failure: "准备失败。不会自动重试。",
      resultUnknown: "无法确认Zoom端结果。请在Zoom Web门户确认。",
      immutable: "准备完成后，正文、外呼对象、临时列表和语音资产不可更改。",
      noSources: "请至少选择一个联系人列表或已同意居民。",
      selection: "选择内容",
      duplicatesRemoved: "已移除重复项",
      uniqueRecipients: "唯一接收者",
      selectedLists: "已选列表",
      selectedResidents: "个别居民",
      messageContent: "朗读内容",
      maskedCaller: "外呼号码",
      queue: "队列",
      maxConcurrency: "最大并发呼叫",
      businessHours: "外呼时段",
      retryPolicy: "重试策略",
      dncPolicy: "DNC策略",
      alwaysRunning: "始终运行",
      enabled: "启用",
      disabled: "禁用",
      expiresAt: "确认到期时间",
      prepareDoesNotSend: "完成准备不会开始呼叫。",
      recipientRules:
        "将获取每个列表中的所有联系人，把电话号码规范化为E.164格式并删除重复项。删除重复项后最多1,000名。",
      selectionReason: "请输入朗读正文，并至少选择一个外呼对象。",
    },
    errors: {
      generic: "处理失败，请稍后重试。",
      permission: "您没有执行此操作的权限。",
      zoomContract: "尚未验证Zoom沙盒写入契约。验证完成前无法执行此操作。",
      zoomMissing:
        "尚未设置Zoom API。请让有权限的管理员检查Developer API设置。",
      zoomScope: "Zoom API缺少必要权限。请让有权限的管理员检查应用权限范围。",
      zoomCredentials:
        "无法验证Zoom API凭据。请让有权限的管理员更新Developer API设置。",
      rateLimited: "已达到Zoom API使用限制。请稍后重试。",
      transient: "Zoom API暂时无法使用。请稍后重试。",
      conflict: "其他更新已生效。请重新加载最新信息后再试。",
      resultUnknown:
        "无法确认Zoom端的处理结果。请勿重新发送操作，并在Zoom Web门户和ZAAD中核对最新状态。",
      notFound: "找不到指定对象。请重新加载最新信息。",
      invalid: "请检查输入或选择内容后再试。",
      resourceInUse: "Zoom正在使用此对象。请先在Zoom Web门户中解除引用后再试。",
      messageBodyRequiresShortening:
        "朗读正文超过500个字符。请缩短至500个字符以内并保存，然后重试。",
      authenticationRequired: "无法确认登录状态。请重新登录。",
      passwordChangeRequired: "请先更改密码再继续操作。",
    },
  },
  "zh-Hant": {
    navLabel: "ZAAD",
    eyebrow: "Zoom Agentless Auto Dialer",
    title: "ZAAD",
    description:
      "管理防災行政無線登記居民、TTS外撥訊息、Zoom Contact Center聯絡人清單、定期活動與單次活動。",
    apiSettings: "Developer API設定",
    apiSettingsPermission:
      "您沒有Developer API的檢視權限，因此無法使用設定頁面。",
    connection: {
      connected: "Zoom API已連線",
      checking: "正在檢查Zoom API",
      missing: "未設定Zoom API",
      scope: "Zoom API權限不足",
      expired: "Zoom API驗證已過期",
      outage: "Zoom API連線錯誤",
    },
    sections: {
      residents: "居民",
      contactLists: "聯絡人清單",
      settings: "登記設定",
      messages: "外撥訊息",
      campaigns: "定期活動",
      oneTime: "單次活動",
    },
    common: {
      create: "建立",
      edit: "編輯",
      delete: "刪除",
      save: "儲存",
      cancel: "取消",
      search: "搜尋",
      clear: "清除",
      loading: "載入中…",
      empty: "沒有可顯示的資料。",
      failure: "處理失敗。",
      success: "處理已完成。",
      readOnly: "您沒有執行此操作的權限。",
      required: "必填",
      previous: "上一頁",
      next: "下一頁",
      confirm: "確認",
      retry: "重試",
      close: "關閉",
    },
    residents: {
      heading: "防災行政無線登記居民",
      description: "可查看、編輯、刪除登記資訊，並從畫面或CSV新增居民。",
      register: "登記居民",
      csv: "CSV批次登記",
      total: "登記居民",
      consented: "已同意",
      synced: "已同步Zoom",
      needsAttention: "需要確認同步",
      name: "姓名",
      contact: "聯絡方式",
      consent: "同意",
      source: "登記來源",
      contactList: "聯絡人清單",
      registeredAt: "登記時間",
      actions: "操作",
      createTitle: "登記居民",
      editTitle: "編輯居民資訊",
      deleteTitle: "刪除居民資訊",
      deleteDescription: "先刪除Zoom聯絡人，再刪除ZAAD居民資訊。",
      email: "電子郵件地址",
      phone: "電話號碼",
      consentedValue: "已同意",
      notConsentedValue: "未同意",
      csvTitle: "使用CSV批次登記居民",
      csvDescription: "驗證所有資料列，確認無誤後才登記。",
      csvHelp:
        "UTF-8，固定標頭 name,email,phone,consent_status，最大1 MiB、1,000列",
      chooseFile: "CSV檔案",
      import: "批次登記",
      noAssignment: "未分配",
      searchPlaceholder: "依姓名、電子郵件或電話搜尋",
      syncPending: "同步中",
      syncSynced: "已同步",
      syncFailed: "同步失敗",
      syncNotAssigned: "僅ZAAD",
      syncNotEligible: "非同步對象",
      sourceWeb: "網頁",
      sourceAdmin: "管理頁面",
      sourceCsv: "CSV",
      csvResultTotal: "總列數",
      csvResultCreated: "登記筆數",
      csvResultDuplicates: "略過重複項目",
      csvErrorHeading: "CSV問題",
      csvErrorRow: "列",
      csvErrorField: "欄位",
      csvErrorReason: "原因",
      csvFieldFile: "檔案",
      csvFieldHeader: "標頭",
      csvFieldRow: "整列",
      csvReasonRequired: "缺少必填值。",
      csvReasonInvalidFormat: "格式不正確。",
      csvReasonInvalidValue: "值不在允許範圍內。",
      csvReasonTooLong: "超出長度限制。",
      csvReasonControlCharacter: "包含不支援的控制字元。",
      csvReasonEmpty: "沒有資料列。",
      csvReasonTooLarge: "檔案超過大小限制。",
      csvReasonInvalidUtf8: "檔案不是有效的UTF-8。",
      csvReasonInvalidStructure: "CSV結構不正確。",
      csvReasonInvalidHeader: "標頭與指定格式不一致。",
      csvReasonTooManyRows: "資料列數超過限制。",
      formInvalid: "請檢查姓名、電子郵件地址、電話號碼和同意狀態。",
      csvFileRequired: "請選擇要登記的CSV檔案。",
    },
    messages: {
      heading: "TTS外撥訊息",
      description: "管理同步至Zoom Contact Center Asset Library的語音訊息。",
      create: "建立訊息",
      list: "訊息清單",
      name: "名稱",
      body: "朗讀本文",
      language: "語言",
      voice: "語音",
      assetId: "Zoom Asset ID",
      status: "同步狀態",
      createTitle: "建立外撥訊息",
      editTitle: "編輯外撥訊息",
      deleteTitle: "刪除外撥訊息",
      deleteDescription: "確認Zoom端使用狀態後刪除。",
      pending: "等待同步",
      synced: "已同步Zoom",
      failed: "同步失敗",
      formInvalid: "請檢查名稱、朗讀本文和語音。",
    },
    contactLists: {
      heading: "活動聯絡人清單",
      description: "顯示、建立、編輯及刪除Zoom Contact Center聯絡人清單。",
      create: "建立聯絡人清單",
      current: "目前登記目標",
      name: "清單名稱",
      descriptionLabel: "說明",
      contacts: "聯絡人",
      updatedAt: "更新時間",
      createTitle: "建立聯絡人清單",
      editTitle: "編輯聯絡人清單",
      deleteTitle: "刪除聯絡人清單",
      deleteDescription: "登記設定或單次活動正在參照的清單無法刪除。",
      formInvalid: "請檢查清單名稱和說明。",
    },
    settings: {
      heading: "公開表單登記設定",
      description: "選擇用於同步新登記且已同意居民的Zoom聯絡人清單。",
      assignment: "新登記目標",
      noAssignment: "未分配（僅登記至ZAAD）",
      save: "儲存登記設定",
      futureOnly: "變更僅適用於今後的新登記，以及從未同意改為已同意的居民。",
    },
    campaigns: {
      heading: "定期活動",
      description: "確認Agentless Dialer活動狀態並啟動或暫停。",
      name: "活動名稱",
      method: "外撥方式",
      status: "狀態",
      contactList: "聯絡人清單",
      details: "詳細資料",
      start: "啟動",
      pause: "暫停",
      startTitle: "啟動活動",
      pauseTitle: "暫停活動",
      startDescription: "確認後將Zoom狀態改為Running並開始自動語音外撥。",
      pauseDescription: "將Zoom狀態改為Paused。可能仍有尚未外撥的聯絡人。",
      operationProfile: "外撥設定",
    },
    oneTime: {
      heading: "單次活動",
      description:
        "輸入突發通知本文和外撥對象，將一次性Agentless Dialer活動準備至Ready。",
      label: "管理名稱",
      body: "朗讀本文",
      voice: "語音",
      baseCampaign: "參照定期活動",
      lists: "聯絡人清單",
      residents: "個別居民",
      summary: "外撥對象概要",
      estimated: "目前估算數量",
      review: "確認本文和外撥對象",
      confirmTitle: "確認準備單次活動",
      confirmDescription:
        "請確認伺服器確定的對象數量和外撥設定。準備本身不會發起通話。",
      acknowledgement:
        "我已確認本文、外撥對象及外撥設定，並理解準備後無法變更，且準備本身不會發起通話。",
      prepare: "準備至Ready",
      preflight: "正在確認外撥對象…",
      snapshotReady: "已取得有效期5分鐘的確認結果。",
      snapshotPending: "正在取得確認結果。",
      prepared: "準備完成。請從定期活動啟動。",
      invalid: "請檢查本文和外撥對象。",
      failure: "準備失敗。不會自動重試。",
      resultUnknown: "無法確認Zoom端結果。請在Zoom Web入口網站確認。",
      immutable: "準備完成後，本文、外撥對象、暫存清單和語音資產無法變更。",
      noSources: "請至少選擇一個聯絡人清單或已同意居民。",
      selection: "選擇內容",
      duplicatesRemoved: "已移除重複項目",
      uniqueRecipients: "唯一接收者",
      selectedLists: "已選清單",
      selectedResidents: "個別居民",
      messageContent: "朗讀內容",
      maskedCaller: "外撥號碼",
      queue: "佇列",
      maxConcurrency: "最大同時外撥",
      businessHours: "外撥時段",
      retryPolicy: "重試政策",
      dncPolicy: "DNC政策",
      alwaysRunning: "持續執行",
      enabled: "啟用",
      disabled: "停用",
      expiresAt: "確認到期時間",
      prepareDoesNotSend: "完成準備不會開始通話。",
      recipientRules:
        "將取得每個清單中的所有聯絡人，把電話號碼正規化為E.164格式並移除重複項目。移除重複項目後最多1,000名。",
      selectionReason: "請輸入朗讀本文，並至少選擇一個外撥對象。",
    },
    errors: {
      generic: "處理失敗，請稍後再試。",
      permission: "您沒有執行此操作的權限。",
      zoomContract: "尚未驗證Zoom沙盒寫入契約。驗證完成前無法執行此操作。",
      zoomMissing:
        "尚未設定Zoom API。請讓有權限的管理員檢查Developer API設定。",
      zoomScope:
        "Zoom API缺少必要權限。請讓有權限的管理員檢查應用程式權限範圍。",
      zoomCredentials:
        "無法驗證Zoom API憑證。請讓有權限的管理員更新Developer API設定。",
      rateLimited: "已達Zoom API使用限制。請稍後再試。",
      transient: "Zoom API暫時無法使用。請稍後再試。",
      conflict: "其他更新已生效。請重新載入最新資訊後再試。",
      resultUnknown:
        "無法確認Zoom端的處理結果。請勿重新傳送操作，並在Zoom Web入口網站與ZAAD中核對最新狀態。",
      notFound: "找不到指定項目。請重新載入最新資訊。",
      invalid: "請檢查輸入或選擇內容後再試。",
      resourceInUse:
        "Zoom正在使用此項目。請先在Zoom Web入口網站中解除參照後再試。",
      messageBodyRequiresShortening:
        "朗讀本文超過500個字元。請縮短至500個字元以內並儲存，然後再試。",
      authenticationRequired: "無法確認登入狀態。請重新登入。",
      passwordChangeRequired: "請先變更密碼再繼續操作。",
    },
  },
  ko: {
    navLabel: "ZAAD",
    eyebrow: "Zoom Agentless Auto Dialer",
    title: "ZAAD",
    description:
      "방재 행정 무선 등록 주민, TTS 발신 메시지, Zoom Contact Center 연락처 목록, 정기 캠페인과 단발 캠페인을 관리합니다.",
    apiSettings: "Developer API 설정",
    apiSettingsPermission:
      "Developer API 조회 권한이 없어 설정 화면을 사용할 수 없습니다.",
    connection: {
      connected: "Zoom API 연결됨",
      checking: "Zoom API 확인 중",
      missing: "Zoom API 미설정",
      scope: "Zoom API 권한 필요",
      expired: "Zoom API 인증 만료",
      outage: "Zoom API 연결 오류",
    },
    sections: {
      residents: "주민",
      contactLists: "연락처 목록",
      settings: "등록 설정",
      messages: "발신 메시지",
      campaigns: "정기 캠페인",
      oneTime: "단발 캠페인",
    },
    common: {
      create: "생성",
      edit: "편집",
      delete: "삭제",
      save: "저장",
      cancel: "취소",
      search: "검색",
      clear: "지우기",
      loading: "불러오는 중…",
      empty: "표시할 데이터가 없습니다.",
      failure: "처리에 실패했습니다.",
      success: "처리가 완료되었습니다.",
      readOnly: "이 작업을 수행할 권한이 없습니다.",
      required: "필수",
      previous: "이전",
      next: "다음",
      confirm: "확인",
      retry: "다시 시도",
      close: "닫기",
    },
    residents: {
      heading: "방재 행정 무선 등록 주민",
      description:
        "등록 정보를 확인·편집·삭제하고 화면 또는 CSV로 새 주민을 등록할 수 있습니다.",
      register: "주민 등록",
      csv: "CSV 일괄 등록",
      total: "등록 주민",
      consented: "동의함",
      synced: "Zoom 동기화 완료",
      needsAttention: "동기화 확인 필요",
      name: "이름",
      contact: "연락처",
      consent: "동의",
      source: "등록 경로",
      contactList: "연락처 목록",
      registeredAt: "등록 일시",
      actions: "작업",
      createTitle: "주민 등록",
      editTitle: "주민 정보 편집",
      deleteTitle: "주민 정보 삭제",
      deleteDescription:
        "Zoom 연락처를 먼저 삭제한 후 ZAAD 주민 정보를 삭제합니다.",
      email: "이메일 주소",
      phone: "전화번호",
      consentedValue: "동의함",
      notConsentedValue: "동의하지 않음",
      csvTitle: "CSV로 주민 일괄 등록",
      csvDescription: "모든 행을 검증하고 문제가 없을 때만 등록합니다.",
      csvHelp:
        "UTF-8, 고정 헤더 name,email,phone,consent_status, 최대 1 MiB·1,000행",
      chooseFile: "CSV 파일",
      import: "일괄 등록",
      noAssignment: "할당 없음",
      searchPlaceholder: "이름, 이메일, 전화번호로 검색",
      syncPending: "동기화 중",
      syncSynced: "동기화 완료",
      syncFailed: "동기화 실패",
      syncNotAssigned: "ZAAD만",
      syncNotEligible: "동기화 대상 아님",
      sourceWeb: "웹",
      sourceAdmin: "관리 화면",
      sourceCsv: "CSV",
      csvResultTotal: "전체 행",
      csvResultCreated: "등록 건수",
      csvResultDuplicates: "중복 건너뜀",
      csvErrorHeading: "CSV 문제",
      csvErrorRow: "행",
      csvErrorField: "항목",
      csvErrorReason: "이유",
      csvFieldFile: "파일",
      csvFieldHeader: "헤더",
      csvFieldRow: "전체 행",
      csvReasonRequired: "필수 값이 없습니다.",
      csvReasonInvalidFormat: "형식이 올바르지 않습니다.",
      csvReasonInvalidValue: "허용되지 않은 값입니다.",
      csvReasonTooLong: "길이 제한을 초과했습니다.",
      csvReasonControlCharacter: "지원하지 않는 제어 문자가 포함되어 있습니다.",
      csvReasonEmpty: "데이터 행이 없습니다.",
      csvReasonTooLarge: "파일 크기 제한을 초과했습니다.",
      csvReasonInvalidUtf8: "유효한 UTF-8 파일이 아닙니다.",
      csvReasonInvalidStructure: "CSV 구조가 올바르지 않습니다.",
      csvReasonInvalidHeader: "헤더가 지정 형식과 일치하지 않습니다.",
      csvReasonTooManyRows: "데이터 행 수 제한을 초과했습니다.",
      formInvalid: "이름, 이메일 주소, 전화번호, 동의 상태를 확인해 주세요.",
      csvFileRequired: "등록할 CSV 파일을 선택해 주세요.",
    },
    messages: {
      heading: "TTS 발신 메시지",
      description:
        "Zoom Contact Center Asset Library에 동기화할 음성 메시지를 관리합니다.",
      create: "메시지 생성",
      list: "메시지 목록",
      name: "이름",
      body: "읽을 본문",
      language: "언어",
      voice: "음성",
      assetId: "Zoom Asset ID",
      status: "동기화 상태",
      createTitle: "발신 메시지 생성",
      editTitle: "발신 메시지 편집",
      deleteTitle: "발신 메시지 삭제",
      deleteDescription: "Zoom 측 사용 상태를 확인한 후 삭제합니다.",
      pending: "동기화 대기",
      synced: "Zoom 동기화 완료",
      failed: "동기화 실패",
      formInvalid: "이름, 읽을 본문, 음성을 확인해 주세요.",
    },
    contactLists: {
      heading: "캠페인 연락처 목록",
      description:
        "Zoom Contact Center 연락처 목록을 표시·생성·편집·삭제합니다.",
      create: "연락처 목록 생성",
      current: "현재 등록 대상",
      name: "목록 이름",
      descriptionLabel: "설명",
      contacts: "연락처",
      updatedAt: "업데이트 일시",
      createTitle: "연락처 목록 생성",
      editTitle: "연락처 목록 편집",
      deleteTitle: "연락처 목록 삭제",
      deleteDescription:
        "등록 설정 또는 단발 캠페인에서 참조 중인 목록은 삭제할 수 없습니다.",
      formInvalid: "목록 이름과 설명을 확인해 주세요.",
    },
    settings: {
      heading: "공개 양식 등록 설정",
      description: "새로 동의한 주민을 동기화할 Zoom 연락처 목록을 선택합니다.",
      assignment: "신규 등록 대상",
      noAssignment: "할당 없음(ZAAD에만 등록)",
      save: "등록 설정 저장",
      futureOnly:
        "변경은 이후 신규 등록과 미동의에서 동의함으로 바뀐 주민에게만 적용됩니다.",
    },
    campaigns: {
      heading: "정기 캠페인",
      description:
        "Agentless Dialer 캠페인의 상태를 확인하고 시작하거나 일시 중지합니다.",
      name: "캠페인 이름",
      method: "발신 방식",
      status: "상태",
      contactList: "연락처 목록",
      details: "상세",
      start: "시작",
      pause: "일시 중지",
      startTitle: "캠페인 시작",
      pauseTitle: "캠페인 일시 중지",
      startDescription:
        "확인 후 Zoom 상태를 Running으로 변경하여 자동 음성 전화 발신을 시작합니다.",
      pauseDescription:
        "Zoom 상태를 Paused로 변경합니다. 아직 발신하지 않은 연락처가 남을 수 있습니다.",
      operationProfile: "발신 설정",
    },
    oneTime: {
      heading: "단발 캠페인",
      description:
        "긴급 안내 본문과 발신 대상을 지정하고 일회용 Agentless Dialer 캠페인을 Ready까지 준비합니다.",
      label: "관리용 이름",
      body: "읽을 본문",
      voice: "음성",
      baseCampaign: "참조할 정기 캠페인",
      lists: "연락처 목록",
      residents: "개별 주민",
      summary: "발신 대상 요약",
      estimated: "선택 중 예상 건수",
      review: "본문과 발신 대상 확인",
      confirmTitle: "단발 캠페인 준비 확인",
      confirmDescription:
        "서버가 확정한 대상 수와 발신 설정을 확인해 주세요. 준비만으로는 발신하지 않습니다.",
      acknowledgement:
        "본문, 발신 대상, 발신 설정을 확인했으며 준비 후에는 변경할 수 없고 준비만으로는 발신하지 않음을 이해했습니다.",
      prepare: "Ready까지 준비",
      preflight: "발신 대상 확인 중…",
      snapshotReady: "5분간 유효한 확인 결과를 가져왔습니다.",
      snapshotPending: "확인 결과를 가져오는 중입니다.",
      prepared: "준비가 완료되었습니다. 정기 캠페인에서 시작해 주세요.",
      invalid: "본문과 발신 대상을 확인해 주세요.",
      failure: "준비에 실패했습니다. 자동으로 다시 시도하지 않습니다.",
      resultUnknown:
        "Zoom 측 결과를 확인할 수 없습니다. Zoom 웹 포털에서 상태를 확인해 주세요.",
      immutable:
        "준비 완료 후 본문, 발신 대상, 임시 목록, 음성 자산은 변경할 수 없습니다.",
      noSources: "연락처 목록 또는 동의한 주민을 한 명 이상 선택해 주세요.",
      selection: "선택 내용",
      duplicatesRemoved: "중복 제거",
      uniqueRecipients: "고유 수신자",
      selectedLists: "선택한 목록",
      selectedResidents: "개별 주민",
      messageContent: "읽을 내용",
      maskedCaller: "발신 번호",
      queue: "큐",
      maxConcurrency: "최대 동시 발신",
      businessHours: "발신 시간",
      retryPolicy: "재시도 정책",
      dncPolicy: "DNC 정책",
      alwaysRunning: "상시 실행",
      enabled: "사용",
      disabled: "사용 안 함",
      expiresAt: "확인 만료 시간",
      prepareDoesNotSend: "준비 완료만으로는 발신하지 않습니다.",
      recipientRules:
        "각 목록의 모든 연락처를 가져와 전화번호를 E.164 형식으로 정규화하고 중복을 제거합니다. 중복 제거 후 최대 1,000명까지 가능합니다.",
      selectionReason:
        "읽을 본문을 입력하고 발신 대상을 한 개 이상 선택해 주세요.",
    },
    errors: {
      generic: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      permission: "이 작업을 수행할 권한이 없습니다.",
      zoomContract:
        "Zoom 샌드박스 쓰기 계약이 확인되지 않았습니다. 확인이 완료될 때까지 이 작업을 사용할 수 없습니다.",
      zoomMissing:
        "Zoom API가 설정되지 않았습니다. 권한이 있는 관리자에게 Developer API 설정 확인을 요청해 주세요.",
      zoomScope:
        "Zoom API에 필요한 권한이 없습니다. 권한이 있는 관리자에게 앱 scope 확인을 요청해 주세요.",
      zoomCredentials:
        "Zoom API 인증 정보를 확인할 수 없습니다. 권한이 있는 관리자에게 Developer API 설정 업데이트를 요청해 주세요.",
      rateLimited:
        "Zoom API 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
      transient:
        "Zoom API를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      conflict:
        "다른 업데이트가 반영되었습니다. 최신 정보를 다시 불러온 후 시도해 주세요.",
      resultUnknown:
        "Zoom 측 처리 결과를 확인할 수 없습니다. 작업을 다시 보내지 말고 Zoom 웹 포털과 ZAAD의 최신 상태를 대조해 주세요.",
      notFound: "대상을 찾을 수 없습니다. 최신 정보를 다시 불러와 주세요.",
      invalid: "입력 또는 선택 내용을 확인한 후 다시 시도해 주세요.",
      resourceInUse:
        "Zoom에서 이 항목을 사용 중입니다. Zoom 웹 포털에서 참조를 해제한 후 다시 시도해 주세요.",
      messageBodyRequiresShortening:
        "읽을 본문이 500자를 초과합니다. 500자 이하로 줄여 저장한 후 다시 시도해 주세요.",
      authenticationRequired:
        "로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.",
      passwordChangeRequired: "계속하기 전에 비밀번호를 변경해 주세요.",
    },
  },
};
