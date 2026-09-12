import type { SiteAccessDictionary } from "./site-access";
import type { MunicipalWorkflowDictionary } from "./municipal-workflows";
import type { OutreachCommonDictionary } from "./outreach-common";
import type { MunicipalOutreachDictionary } from "./municipal-outreach";
import type { UniversityOutreachDictionary } from "./university-outreach";
// 対応ロケールと UI 文言の辞書。
// ルーティングを使わず、クライアント側で言語を切り替えるシンプルな構成。

import {
  DEFAULT_SITE_LOCALE,
  SITE_LOCALES,
  isSiteLocale,
  type SettingsErrorCode,
  type SiteLocale,
} from "@/lib/site-settings";
import type { AdminUserErrorCode } from "@/lib/admin-users";
import type { DeveloperApiErrorCode } from "@/lib/developer-api-settings";
import type {
  AdminAccessAction,
  AdminAccessSystemRole,
  AdminResourceKey,
} from "@/lib/admin-access/types";
import type {
  ReservationAvailabilityStatus,
  ReservationBookingSource,
  ReservationServiceKey,
} from "@/lib/reservations";
import type { ReservationApiPermission } from "@/lib/reservation-api";
import { zaadDictionaries, type ZaadDictionary } from "./zaad-dictionaries";
import type { TenantKey } from "@/lib/tenants";
import type { ConsultationService } from "@/lib/online-consultation-catalog";
import type { TenantContentDictionary } from "./tenant-content";

export const locales = SITE_LOCALES;

export type Locale = SiteLocale;

export const defaultLocale: Locale = DEFAULT_SITE_LOCALE;

export const isLocale = isSiteLocale;

// 言語メニューに表示する各言語の名称（常にその言語自身の表記）
export const localeNames: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ko: "한국어",
};

/**
 * 画面が参照する完成した辞書。共通クロームと業種コンテンツの合成結果であり、
 * 利用側（useI18n().t）から見た形はテナント軸の導入前と変わらない。
 */
export type Dictionary = ChromeDictionary & TenantContentDictionary & { siteAccess: SiteAccessDictionary; universityOutreach: UniversityOutreachDictionary; municipalOutreach: MunicipalOutreachDictionary; outreachCommon: OutreachCommonDictionary; municipalWorkflows: MunicipalWorkflowDictionary };

export type IndustrySettingsDictionary = {
  openUniversitySettings: string;
  saveError: string;
  saving: string;
  pageHelpLabel: string;
  pageHelpDescription: string;
  placeholder: string;
  label: string;
  help: string;
  scope: string;
  saved: string;
  dirty: string;
  loading: string;
  loadError: string;
  retry: string;
  readonly: string;
  invalid: string;
  continue: string;
  discard: string;
  confirmTitle: string;
  confirmTenant: string;
  confirmPage: string;
  consultationTitle: string;
  consultationDescription: string;
  consultationConnectionLabel: string;
  consultationTagDescription: string;
  tag: string;
  tagHelp: string;
  memo: string;
  invalidInput: string;
  names: Record<TenantKey, string>;
  services: Record<ConsultationService, string>;
};

export type ChromeDictionary = {
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
  maintenance: {
    title: string;
    description: string;
  };
  findInfo: {
    title: string;
    subtitle: string;
    sectionLabel: string;
    call: { title: string; description: string; unavailableAlert: string };
  };
  news: {
    title: string;
    subtitle: string;
    more: string;
    close: string;
    category: { new: string; featured: string };
  };
  contentPages: {
    breadcrumbLabel: string;
    tableOfContents: string;
    home: string;
    newsIndexTitle: string;
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
    contactPhoneLabel: string;
    backToCategory: string;
    publishedLabel: string;
    readMore: string;
    faq: {
      indexLead: string;
      departmentsHeading: string;
      departmentLead: string;
      categoriesHeading: string;
      categoryLead: string;
      questionsHeading: string;
      questionCount: string;
      backToIndex: string;
      backToDepartment: string;
    };
  };
  footer: {
    terms: string;
    privacy: string;
    feedback: string;
    sitemap: string;
    login: string;
    goToAdmin: string;
    phoneLabel: string;
    phoneNote: string;
  };
  docs: {
    viewAsMarkdown: string;
  };
  links: {
    opensInNewTab: string;
  };
  auth: {
    loginTitle: string;
    loginDescription: string;
    email: string;
    password: string;
    currentPassword: string;
    newPassword: string;
    showPassword: string;
    hidePassword: string;
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
    copyTemporaryPassword: string;
    temporaryPasswordCopied: string;
    temporaryPasswordCopyFailed: string;
    required: string;
    error: string;
  };
  admin: {
    industrySettings: IndustrySettingsDictionary;
    title: string;
    pageDescriptionLabel: string;
    users: string;
    newUser: string;
    createUserAction: string;
    passwordResets: string;
    phoneSettings: string;
    chatSettings: string;
    onlineConsultation: string;
    languageSettings: string;
    maintenanceSettings: string;
    developerApi: string;
    reservations: string;
    zaad: ZaadDictionary;
    settingsMenu: string;
    navigation: {
      usersSection: string;
      settingsSection: string;
      usersSectionNavigation: string;
      settingsSectionNavigation: string;
      backToSite: string;
      openMenu: string;
      closeMenu: string;
      collapseSidebar: string;
      expandSidebar: string;
      accountMenuLabel: string;
      openAccountMenu: string;
      closeAccountMenu: string;
    };
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
    paginationLabel: string;
    previous: string;
    next: string;
    issuedPasswordTitle: string;
    issuedPasswordDescription: string;
    adminOnly: string;
    myPage: { title: string; description: string; name: string; email: string; noAccess: string; denied: string };
    accessControl: {
      rolesNav: string;
      listTitle: string;
      listDescription: string;
      roleCount: string;
      addRole: string;
      createTitle: string;
      createDescription: string;
      roleName: string;
      roleNameRequired: string;
      roleNameTooLong: string;
      roleDescription: string;
      descriptionOptional: string;
      memberCount: string;
      actions: string;
      edit: string;
      editRoleTitle: string;
      editRoleDescription: string;
      systemRole: string;
      systemRoleReadOnly: string;
      noRoles: string;
      cancel: string;
      add: string;
      saving: string;
      save: string;
      saved: string;
      reload: string;
      deleteRole: string;
      backToRoles: string;
      backToUserDetails: string;
      settingsTab: string;
      membersTab: string;
      adminPageAccessTitle: string;
      adminPageAccessDescription: string;
      adminPageColumn: string;
      allow: string;
      deny: string;
      unset: string;
      unsupported: string;
      path: string;
      targetPaths: string;
      assignedRoles: string;
      noAssignedRoles: string;
      effectiveAccess: string;
      userAccessPageTitle: string;
      userAccessTitle: string;
      userAccessHeading: string;
      userAccessDescription: string;
      viewAccess: string;
      allowed: string;
      denied: string;
      genericError: string;
      conflictError: string;
      duplicateError: string;
      listSearchPlaceholder: string;
      memberSearchPlaceholder: string;
      candidateSearchPlaceholder: string;
      assignUsers: string;
      assign: string;
      removeAssignment: string;
      noMembers: string;
      noCandidates: string;
      candidateDialogTitle: string;
      candidateDialogDescription: string;
      deleteRoleTitle: string;
      deleteRoleDescription: string;
      roleInUse: string;
      readOnlyRoleAction: string;
      adminAttributeHelp: string;
      assignedRolesHelp: string;
      accessRoleSummaryHelp: string;
      replaceAccessRoleHelp: string;
      loading: string;
      accountSuspended: string;
      passwordChangeRequired: string;
      systemRoleNames: Record<AdminAccessSystemRole, string>;
      systemRoleDescriptions: Record<AdminAccessSystemRole, string>;
      resourceTitles: Record<AdminResourceKey, string>;
      resourceDescriptions: Record<AdminResourceKey, string>;
      actionLabels: Record<AdminAccessAction, string>;
    };
    userManagement: {
      detailsPageTitle: string;
      detailsTitle: string;
      detailsDescription: string;
      detailsReadOnly: string;
      name: string;
      accessRoles: string;
      backToUsers: string;
      settings: string;
      actionsFor: string;
      edit: string;
      suspend: string;
      reactivate: string;
      delete: string;
      active: string;
      suspended: string;
      save: string;
      saving: string;
      cancel: string;
      saved: string;
      password: string;
      resetPassword: string;
      passwordConfigured: string;
      passwordChangeRequired: string;
      passwordVisibilityHelp: string;
      selfPasswordResetProtected: string;
      passwordMode: string;
      temporaryPasswordMode: string;
      temporaryPasswordModeDescription: string;
      standardPasswordMode: string;
      standardPasswordModeDescription: string;
      newPassword: string;
      confirmPassword: string;
      passwordsMatch: string;
      passwordRequirements: string;
      generateTemporaryPassword: string;
      revokeSessions: string;
      revokeSessionsDescription: string;
      enabled: string;
      disabled: string;
      passwordDialogTitle: string;
      passwordDialogDescription: string;
      confirmPasswordReset: string;
      passwordResetSaved: string;
      selfProtected: string;
      lastAdminProtected: string;
      emailDialogTitle: string;
      emailDialogDescription: string;
      currentEmail: string;
      newEmail: string;
      changeEmail: string;
      suspendDialogTitle: string;
      suspendDialogDescription: string;
      reactivateDialogTitle: string;
      reactivateDialogDescription: string;
      deleteDialogTitle: string;
      deleteDialogDescription: string;
      targetUser: string;
      errors: Record<AdminUserErrorCode, string>;
    };
    settings: {
      save: string;
      saving: string;
      saved: string;
      saveError: string;
      pageSaveScope: string;
      sectionSaveScope: string;
      errors: Record<SettingsErrorCode, string>;
    };
    phoneManagement: {
      title: string;
      description: string;
      representativeTitle: string;
      representativeDescription: string;
      representativeDisplayLabel: string;
      representativeDisplayHelp: string;
      representativeE164Label: string;
      representativeE164Help: string;
      aiPhoneTitle: string;
      aiPhoneDescription: string;
      aiPhoneLabel: string;
      hidden: string;
    };
    developerApiManagement: {
      title: string;
      description: string;
      oauthTitle: string;
      oauthDescription: string;
      webhookTitle: string;
      webhookDescription: string;
      accountId: string;
      clientId: string;
      clientSecret: string;
      secretToken: string;
      errors: Record<DeveloperApiErrorCode, string>;
    };
    chatManagement: {
      title: string;
      description: string;
      methodTab: string;
      campaignTab: string;
      activeModeTitle: string;
      activeModeDescription: string;
      active: string;
      inactive: string;
      modes: {
        disabled: {
          label: string;
          description: string;
        };
        campaign: {
          label: string;
          description: string;
        };
        contactCenterEntryId: {
          label: string;
          description: string;
        };
      };
      campaign: {
        title: string;
        description: string;
        webTagLabel: string;
        webTagHelp: string;
        memoLabel: string;
        memoHelp: string;
      };
      contactCenterEntryId: {
        title: string;
        description: string;
        webTagLabel: string;
        webTagHelp: string;
        memoLabel: string;
        memoHelp: string;
      };
    };
    languageManagement: {
      title: string;
      description: string;
      enabledCountLabel: string;
      japaneseRequired: string;
      moveUp: string;
      moveDown: string;
    };
    maintenanceManagement: {
      title: string;
      description: string;
      environmentLabel: string;
      environments: {
        production: string;
        preview: string;
        development: string;
      };
      effectiveStateTitle: string;
      effectiveActive: string;
      effectiveInactive: string;
      effectiveUnknown: string;
      currentValueUnavailableTitle: string;
      currentValueUnavailableDescription: string;
      modeTitle: string;
      modeDescription: string;
      modes: {
        disabled: {
          label: string;
          description: string;
        };
        enabled: {
          label: string;
          description: string;
        };
        scheduled: {
          label: string;
          description: string;
        };
      };
      scheduleTitle: string;
      scheduleDescription: string;
      scheduledStartLabel: string;
      scheduledEndLabel: string;
      timeZoneNote: string;
      scheduleRequired: string;
      scheduleOrderError: string;
      scheduleEndFutureError: string;
      conflictError: string;
      warningTitle: string;
      warningDescription: string;
      propagationNote: string;
      updatedAtLabel: string;
    };
    reservationManagement: ReservationManagementDictionary;
  };
};

export type ReservationBookingListDictionary = {
  entry: string;
  back: string;
  title: string;
  description: string;
  unknownEndTime: string;
  filter: {
    heading: string;
    service: string;
    allServices: string;
    source: string;
    allSources: string;
    zva: string;
    demo: string;
    submit: string;
  };
  list: {
    title: string;
    description: string;
    count: string;
    reservationDateTime: string;
    service: string;
    reservationId: string;
    source: string;
    createdAt: string;
    scrollRegion: string;
    next: string;
    emptyTitle: string;
    emptyDescription: string;
  };
};

export type ReservationManagementDictionary = {
  title: string;
  description: string;
  demoFill: string;
  serviceLabel: string;
  previousMonth: string;
  currentMonth: string;
  nextMonth: string;
  methods: { DATE: string; DATETIME: string };
  facilityMethod: string;
  services: Record<
    ReservationServiceKey,
    { name: string; description: string }
  >;
  weekdays: readonly [string, string, string, string, string, string, string];
  statuses: Record<ReservationAvailabilityStatus, string>;
  legend: string;
  availableTimes: string;
  availableDate: string;
  noSlots: string;
  dateSlot: string;
  bookedCount: string;
  openSlotCount: string;
  dateCount: string;
  dateReservationSummary: string;
  reservationListTitle: string;
  reservationId: string;
  createdAt: string;
  sources: Record<ReservationBookingSource, string>;
  noReservations: string;
  slotAction: string;
  slotReservationDescription: string;
  close: string;
  readOnlyNotice: string;
  generated: string;
  loadingError: string;
  generationError: string;
  bookings: ReservationBookingListDictionary;
  apiKeys: ReservationApiKeyDictionary;
};

export type ReservationApiRequestLogDictionary = {
  entry: string;
  backToKeys: string;
  title: string;
  description: string;
  filter: {
    heading: string;
    search: string;
    searchPlaceholder: string;
    method: string;
    result: string;
    all: string;
    success: string;
    clientError: string;
    serverError: string;
    submit: string;
  };
  list: {
    title: string;
    description: string;
    count: string;
    requestedAt: string;
    apiKey: string;
    method: string;
    api: string;
    result: string;
    duration: string;
    requestId: string;
    scrollRegion: string;
    next: string;
    emptyTitle: string;
    emptyDescription: string;
  };
  detail: {
    back: string;
    title: string;
    request: string;
    normalizedJson: string;
    credentialNotice: string;
    response: string;
    httpStatus: string;
    success: string;
    failure: string;
    json: string;
    properties: string;
    requestedAt: string;
    apiKey: string;
    method: string;
    permission: string;
    status: string;
    duration: string;
    completedAt: string;
    requestId: string;
    idempotencyOutcome: string;
    responseLocation: string;
    responseEtag: string;
    notApplicable: string;
    created: string;
    requestCopyLabel: string;
    requestCopied: string;
    requestCopyFailed: string;
    responseCopyLabel: string;
    responseCopied: string;
    responseCopyFailed: string;
  };
};

export type ReservationApiKeyDictionary = {
  entry: string;
  title: string;
  description: string;
  back: string;
  issue: string;
  readOnly: string;
  usage: {
    title: string;
    description: string;
    change: string;
    limit: string;
    current: string;
    remaining: string;
    unlimited: string;
    resets: string;
  };
  api: {
    title: string;
    description: string;
    method: string;
    endpoint: string;
    permission: string;
    operation: string;
    descriptions: Record<ReservationApiPermission, string>;
    operations: Record<
      | "services"
      | "availability"
      | "list"
      | "read"
      | "create"
      | "replace"
      | "update"
      | "delete",
      string
    >;
  };
  keys: {
    title: string;
    description: string;
    name: string;
    key: string;
    nameKey: string;
    permissions: string;
    monthlyLimit: string;
    monthlyUsage: string;
    status: string;
    created: string;
    lastUsed: string;
    actions: string;
    actionsFor: string;
    active: string;
    revoked: string;
    never: string;
    unlimited: string;
    remaining: string;
    changeLimit: string;
    revoke: string;
    emptyTitle: string;
    emptyDescription: string;
  };
  issueDialog: {
    title: string;
    description: string;
    name: string;
    namePlaceholder: string;
    permissions: string;
    permissionsDescription: string;
    permissionError: string;
    limitTitle: string;
    limitDescription: string;
    limitLimitedDescription: string;
    limitInputLabel: string;
    submit: string;
    successTitle: string;
    successDescription: string;
    keyLabel: string;
    copy: string;
    copied: string;
    close: string;
  };
  revokeDialog: { title: string; description: string; confirm: string };
  usageDialog: {
    title: string;
    description: string;
    limited: string;
    unlimited: string;
    unit: string;
    help: string;
    invalid: string;
    submit: string;
  };
  keyUsageDialog: {
    title: string;
    description: string;
    legend: string;
    limitedDescription: string;
    unlimited: string;
    unlimitedDescription: string;
    issueUnlimitedDescription: string;
    submit: string;
  };
  logs: ReservationApiRequestLogDictionary;
  cancel: string;
  saving: string;
  genericError: string;
  conflictError: string;
};

const reservationApiKeyCopy: Record<Locale, ReservationApiKeyDictionary> = {
  ja: {
    entry: "APIキー管理",
    title: "予約APIキー",
    description:
      "外部システムから予約を参照・登録・変更・削除するためのAPIキーと権限を管理します。",
    back: "予約システムに戻る",
    issue: "APIキーを発行",
    readOnly:
      "APIキーの発行と無効化、月間上限の変更には予約システムの編集権限が必要です。",
    usage: {
      title: "全体の月間リクエスト上限",
      description:
        "すべての予約APIキーを合算する自治体全体の上限です。キーごとの上限と両方が適用されます。",
      change: "上限を変更",
      limit: "現在の上限",
      current: "今月の利用",
      remaining: "残り",
      unlimited: "上限なし",
      resets: "{date}にリセットされます。",
    },
    api: {
      title: "公開API",
      description:
        "Authorization ヘッダーに Bearer 形式でAPIキーを指定します。作成・個別取得・更新・削除では、X-Reservation-Caller-Phone にE.164形式の発信者ANIを指定し、利用者が発話した番号で代用しないでください。作成時は Idempotency-Key、更新・削除時は If-Match も必要です。",
      method: "メソッド",
      endpoint: "エンドポイント",
      permission: "権限",
      operation: "操作",
      descriptions: {
        LIST: "予約一覧の取得",
        READ: "指定した予約の取得",
        CREATE: "予約の登録",
        UPDATE: "予約の変更",
        DELETE: "予約の削除",
      },
      operations: {
        services: "サービス一覧の取得",
        availability: "空き枠の取得",
        list: "予約一覧の取得",
        read: "指定した予約の取得",
        create: "予約の登録",
        replace: "予約の置換",
        update: "予約の変更",
        delete: "予約の削除",
      },
    },
    keys: {
      title: "発行済みAPIキー",
      description:
        "キー本体は発行直後に一度だけ表示されます。APIキーごとに月間上限と利用状況を管理できます。",
      name: "名前",
      key: "APIキー",
      nameKey: "名前 / キー",
      permissions: "権限",
      monthlyLimit: "月間上限",
      monthlyUsage: "今月の利用",
      status: "状態",
      created: "発行日時",
      lastUsed: "最終利用",
      actions: "操作",
      actionsFor: "操作: {name}",
      active: "有効",
      revoked: "無効",
      never: "未利用",
      unlimited: "上限なし",
      remaining: "残り",
      changeLimit: "上限を変更",
      revoke: "無効化",
      emptyTitle: "APIキーはまだ発行されていません",
      emptyDescription:
        "外部システムごとに必要な権限だけを選んで発行してください。",
    },
    issueDialog: {
      title: "APIキーを発行",
      description:
        "利用する外部システムを識別できる名前と、許可する操作を選択してください。",
      name: "APIキー名",
      namePlaceholder: "例：予約連携システム",
      permissions: "権限",
      permissionsDescription:
        "少なくとも1つ選択してください。権限はそれぞれ独立しています。",
      permissionError: "権限を1つ以上選択してください。",
      limitTitle: "キーごとの月間リクエスト上限",
      limitDescription:
        "このAPIキーに適用する上限を指定します。全体上限も別に適用されます。",
      limitLimitedDescription: "100件以上で設定します。",
      limitInputLabel: "1か月の上限",
      submit: "発行する",
      successTitle: "APIキーを発行しました",
      successDescription:
        "このキーは再表示できません。今すぐ安全な場所にコピーしてください。",
      keyLabel: "APIキー",
      copy: "コピー",
      copied: "APIキーをコピーしました。",
      close: "閉じる",
    },
    revokeDialog: {
      title: "APIキーを無効化しますか？",
      description:
        "「{name}」は直ちに公開APIへアクセスできなくなります。この操作は取り消せません。",
      confirm: "無効化する",
    },
    usageDialog: {
      title: "月間リクエスト上限を変更",
      description:
        "予約公開API全体で1か月に受け付けるリクエスト数を設定します。",
      limited: "上限を設定",
      unlimited: "上限なし",
      unit: "件",
      help: "最小100件。10,000件を超える場合は100件単位で設定してください。",
      invalid:
        "100件以上の整数を入力してください。10,000件を超える場合は100件単位です。",
      submit: "保存する",
    },
    keyUsageDialog: {
      title: "APIキーの月間上限を変更",
      description:
        "「{name}」が1か月に利用できるリクエスト数を設定します。全体上限も引き続き適用されます。",
      legend: "キーごとの上限設定",
      limitedDescription: "このAPIキーだけに適用します。",
      unlimited: "キーごとの上限なし",
      unlimitedDescription:
        "このキーの利用件数は集計し、全体上限だけを適用します。",
      issueUnlimitedDescription: "利用件数は集計し、全体上限だけを適用します。",
      submit: "保存する",
    },
    logs: {
      entry: "利用ログを確認",
      backToKeys: "APIキー管理に戻る",
      title: "API利用ログ",
      description:
        "予約公開APIを実行したAPIキー、日時、エンドポイント、結果を確認できます。",
      filter: {
        heading: "利用ログを絞り込む",
        search: "検索",
        searchPlaceholder: "リクエストID、APIキー名、キー識別子",
        method: "メソッド",
        result: "結果",
        all: "すべて",
        success: "成功（2xx）",
        clientError: "クライアントエラー（4xx）",
        serverError: "サーバーエラー（5xx）",
        submit: "絞り込む",
      },
      list: {
        title: "実行履歴",
        description: "新しい実行順に50件ずつ表示します。",
        count: "{count}件",
        requestedAt: "実行日時",
        apiKey: "実行APIキー",
        method: "メソッド",
        api: "API",
        result: "結果",
        duration: "処理時間",
        requestId: "リクエストID",
        scrollRegion: "実行履歴の表",
        next: "次の50件",
        emptyTitle: "条件に一致する利用ログはありません",
        emptyDescription:
          "検索条件を変更するか、公開APIの実行後にもう一度確認してください。",
      },
      detail: {
        back: "API利用ログに戻る",
        title: "API利用ログの詳細",
        request: "リクエスト",
        normalizedJson: "正規化済みJSON",
        credentialNotice:
          "認証ヘッダー、発信者電話番号ヘッダー、Idempotency-Key、未解析のリクエスト本文は保存しません。",
        response: "レスポンス",
        httpStatus: "HTTP {status}",
        success: "成功",
        failure: "失敗",
        json: "JSON",
        properties: "プロパティ",
        requestedAt: "実行日時",
        apiKey: "APIキー",
        method: "メソッド",
        permission: "権限",
        status: "ステータス",
        duration: "処理時間",
        completedAt: "完了日時",
        requestId: "リクエストID",
        idempotencyOutcome: "冪等性結果",
        responseLocation: "Location",
        responseEtag: "ETag",
        notApplicable: "—",
        created: "Created",
        requestCopyLabel: "リクエストJSONをコピー",
        requestCopied: "リクエストJSONをコピーしました。",
        requestCopyFailed: "リクエストJSONをコピーできませんでした。",
        responseCopyLabel: "レスポンスJSONをコピー",
        responseCopied: "レスポンスJSONをコピーしました。",
        responseCopyFailed: "レスポンスJSONをコピーできませんでした。",
      },
    },
    cancel: "キャンセル",
    saving: "処理中…",
    genericError: "処理できませんでした。もう一度お試しください。",
    conflictError: "他の変更と競合しました。再読み込みしてお試しください。",
  },
  en: {
    entry: "API key management",
    title: "Reservation API keys",
    description:
      "Manage API keys and permissions for external systems that read and manage reservations.",
    back: "Back to reservations",
    issue: "Issue API key",
    readOnly:
      "Edit permission for the reservation system is required to issue or revoke keys and change the monthly limit.",
    usage: {
      title: "Overall monthly request limit",
      description:
        "This municipality-wide limit combines requests from every reservation API key. Each key limit also applies.",
      change: "Change limit",
      limit: "Current limit",
      current: "Used this month",
      remaining: "Remaining",
      unlimited: "No limit",
      resets: "Resets on {date}.",
    },
    api: {
      title: "Public API",
      description:
        "Send the API key as a Bearer token. For create, item read, update, and delete, send the caller ANI in E.164 format as X-Reservation-Caller-Phone; never substitute a number spoken by the user. Include Idempotency-Key when creating and If-Match when updating or deleting.",
      method: "Method",
      endpoint: "Endpoint",
      permission: "Permission",
      operation: "Operation",
      descriptions: {
        LIST: "List reservations",
        READ: "Get the specified reservation",
        CREATE: "Create a reservation",
        UPDATE: "Update a reservation",
        DELETE: "Delete a reservation",
      },
      operations: {
        services: "List services",
        availability: "Get availability",
        list: "List reservations",
        read: "Get the specified reservation",
        create: "Create a reservation",
        replace: "Replace a reservation",
        update: "Update a reservation",
        delete: "Delete a reservation",
      },
    },
    keys: {
      title: "Issued API keys",
      description:
        "A key is shown only once, immediately after issue. Manage the monthly limit and usage for each API key here.",
      name: "Name",
      key: "API key",
      nameKey: "Name / key",
      permissions: "Permissions",
      monthlyLimit: "Monthly limit",
      monthlyUsage: "Used this month",
      status: "Status",
      created: "Issued",
      lastUsed: "Last used",
      actions: "Actions",
      actionsFor: "Actions: {name}",
      active: "Active",
      revoked: "Revoked",
      never: "Never",
      unlimited: "No limit",
      remaining: "Remaining",
      changeLimit: "Change limit",
      revoke: "Revoke",
      emptyTitle: "No API keys have been issued",
      emptyDescription:
        "Issue a separate key with only the permissions each external system needs.",
    },
    issueDialog: {
      title: "Issue API key",
      description:
        "Enter a name that identifies the external system and select its allowed operations.",
      name: "API key name",
      namePlaceholder: "Example: Reservation integration",
      permissions: "Permissions",
      permissionsDescription:
        "Select at least one. Each permission is independent.",
      permissionError: "Select at least one permission.",
      limitTitle: "Monthly request limit for this key",
      limitDescription:
        "Set the limit for this API key. The overall limit also applies separately.",
      limitLimitedDescription: "Set a value of at least 100 requests.",
      limitInputLabel: "Monthly limit",
      submit: "Issue",
      successTitle: "API key issued",
      successDescription:
        "This key cannot be shown again. Copy it to a secure location now.",
      keyLabel: "API key",
      copy: "Copy",
      copied: "API key copied.",
      close: "Close",
    },
    revokeDialog: {
      title: "Revoke this API key?",
      description:
        "“{name}” will immediately lose access to the public API. This cannot be undone.",
      confirm: "Revoke",
    },
    usageDialog: {
      title: "Change monthly request limit",
      description:
        "Set the number of requests accepted by the reservation public API each month.",
      limited: "Set a limit",
      unlimited: "No limit",
      unit: "requests",
      help: "Minimum 100. Values above 10,000 must be in increments of 100.",
      invalid:
        "Enter an integer of at least 100. Values above 10,000 must be in increments of 100.",
      submit: "Save",
    },
    keyUsageDialog: {
      title: "Change API key monthly limit",
      description:
        "Set how many requests “{name}” can use each month. The overall limit continues to apply.",
      legend: "Limit for this key",
      limitedDescription: "Applies only to this API key.",
      unlimited: "No limit for this key",
      unlimitedDescription:
        "Usage is still counted and only the overall limit applies.",
      issueUnlimitedDescription:
        "Usage is counted and only the overall limit applies.",
      submit: "Save",
    },
    logs: {
      entry: "View usage logs",
      backToKeys: "Back to API key management",
      title: "API usage logs",
      description:
        "Review the API key, time, endpoint, and result for reservation public API requests.",
      filter: {
        heading: "Filter usage logs",
        search: "Search",
        searchPlaceholder: "Request ID, API key name, or key identifier",
        method: "Method",
        result: "Result",
        all: "All",
        success: "Success (2xx)",
        clientError: "Client error (4xx)",
        serverError: "Server error (5xx)",
        submit: "Filter",
      },
      list: {
        title: "Execution history",
        description: "Shows 50 requests at a time, newest first.",
        count: "{count} results",
        requestedAt: "Executed",
        apiKey: "API key used",
        method: "Method",
        api: "API",
        result: "Result",
        duration: "Duration",
        requestId: "Request ID",
        scrollRegion: "Execution history table",
        next: "Next 50",
        emptyTitle: "No usage logs match these conditions",
        emptyDescription:
          "Change the filters or check again after the public API is used.",
      },
      detail: {
        back: "Back to API usage logs",
        title: "API usage log details",
        request: "Request",
        normalizedJson: "Normalized JSON",
        credentialNotice:
          "Authentication headers, caller phone headers, Idempotency-Key values, and unparsed request bodies are not stored.",
        response: "Response",
        httpStatus: "HTTP {status}",
        success: "Success",
        failure: "Failed",
        json: "JSON",
        properties: "Properties",
        requestedAt: "Executed",
        apiKey: "API key",
        method: "Method",
        permission: "Permission",
        status: "Status",
        duration: "Duration",
        completedAt: "Completed",
        requestId: "Request ID",
        idempotencyOutcome: "Idempotency result",
        responseLocation: "Location",
        responseEtag: "ETag",
        notApplicable: "—",
        created: "Created",
        requestCopyLabel: "Copy request JSON",
        requestCopied: "Request JSON copied.",
        requestCopyFailed: "Could not copy request JSON.",
        responseCopyLabel: "Copy response JSON",
        responseCopied: "Response JSON copied.",
        responseCopyFailed: "Could not copy response JSON.",
      },
    },
    cancel: "Cancel",
    saving: "Working…",
    genericError: "The operation could not be completed. Please try again.",
    conflictError: "This conflicts with another change. Reload and try again.",
  },
  "zh-Hans": {
    entry: "API密钥管理",
    title: "预约API密钥",
    description: "管理外部系统查询、创建、修改和删除预约所需的API密钥与权限。",
    back: "返回预约系统",
    issue: "签发API密钥",
    readOnly: "签发或撤销密钥及修改月度上限需要预约系统编辑权限。",
    usage: {
      title: "整体每月请求上限",
      description:
        "这是汇总所有预约API密钥请求的自治体整体上限，同时也会应用各密钥的单独上限。",
      change: "修改上限",
      limit: "当前上限",
      current: "本月使用量",
      remaining: "剩余",
      unlimited: "无限制",
      resets: "将于{date}重置。",
    },
    api: {
      title: "公开API",
      description:
        "请在Authorization标头中以Bearer形式指定API密钥。创建、单项查询、更新和删除时，请在 X-Reservation-Caller-Phone 中传递E.164格式的主叫ANI，不得用用户口述的号码代替。创建时还需指定 Idempotency-Key，更新和删除时还需指定 If-Match。",
      method: "方法",
      endpoint: "端点",
      permission: "权限",
      operation: "操作",
      descriptions: {
        LIST: "获取预约列表",
        READ: "获取指定预约",
        CREATE: "创建预约",
        UPDATE: "修改预约",
        DELETE: "删除预约",
      },
      operations: {
        services: "获取服务列表",
        availability: "获取可用时段",
        list: "获取预约列表",
        read: "获取指定预约",
        create: "创建预约",
        replace: "替换预约",
        update: "修改预约",
        delete: "删除预约",
      },
    },
    keys: {
      title: "已签发API密钥",
      description:
        "密钥本身仅在签发后显示一次。可在此管理各API密钥的月度上限和使用量。",
      name: "名称",
      key: "API密钥",
      nameKey: "名称 / 密钥",
      permissions: "权限",
      monthlyLimit: "每月上限",
      monthlyUsage: "本月使用量",
      status: "状态",
      created: "签发时间",
      lastUsed: "最后使用",
      actions: "操作",
      actionsFor: "操作：{name}",
      active: "有效",
      revoked: "已撤销",
      never: "未使用",
      unlimited: "无限制",
      remaining: "剩余",
      changeLimit: "修改上限",
      revoke: "撤销",
      emptyTitle: "尚未签发API密钥",
      emptyDescription: "请为每个外部系统仅选择必要权限后签发。",
    },
    issueDialog: {
      title: "签发API密钥",
      description: "输入用于识别外部系统的名称并选择允许的操作。",
      name: "API密钥名称",
      namePlaceholder: "例：预约集成系统",
      permissions: "权限",
      permissionsDescription: "请至少选择一项。各项权限彼此独立。",
      permissionError: "请至少选择一项权限。",
      limitTitle: "单个密钥每月请求上限",
      limitDescription: "指定此API密钥的上限。整体上限也会另行应用。",
      limitLimitedDescription: "请设置为100次以上。",
      limitInputLabel: "每月上限",
      submit: "签发",
      successTitle: "API密钥已签发",
      successDescription: "此密钥无法再次显示，请立即复制到安全位置。",
      keyLabel: "API密钥",
      copy: "复制",
      copied: "API密钥已复制。",
      close: "关闭",
    },
    revokeDialog: {
      title: "要撤销API密钥吗？",
      description: "“{name}”将立即无法访问公开API，此操作无法撤销。",
      confirm: "撤销",
    },
    usageDialog: {
      title: "修改每月请求上限",
      description: "设置预约公开API每月接受的请求数。",
      limited: "设置上限",
      unlimited: "无限制",
      unit: "次",
      help: "最少100次。超过10,000时须按100的倍数设置。",
      invalid: "请输入不小于100的整数；超过10,000时须为100的倍数。",
      submit: "保存",
    },
    keyUsageDialog: {
      title: "修改API密钥每月上限",
      description: "设置“{name}”每月可使用的请求数。整体上限仍会继续应用。",
      legend: "单个密钥上限设置",
      limitedDescription: "仅应用于此API密钥。",
      unlimited: "此密钥无限制",
      unlimitedDescription: "仍会统计此密钥的使用量，仅应用整体上限。",
      issueUnlimitedDescription: "仍会统计使用量，仅应用整体上限。",
      submit: "保存",
    },
    logs: {
      entry: "查看使用日志",
      backToKeys: "返回API密钥管理",
      title: "API使用日志",
      description: "查看预约公开API请求所使用的API密钥、执行时间、端点和结果。",
      filter: {
        heading: "筛选使用日志",
        search: "搜索",
        searchPlaceholder: "请求ID、API密钥名称或密钥标识符",
        method: "方法",
        result: "结果",
        all: "全部",
        success: "成功（2xx）",
        clientError: "客户端错误（4xx）",
        serverError: "服务器错误（5xx）",
        submit: "筛选",
      },
      list: {
        title: "执行记录",
        description: "按最新执行顺序每次显示50条。",
        count: "{count}条",
        requestedAt: "执行时间",
        apiKey: "执行API密钥",
        method: "方法",
        api: "API",
        result: "结果",
        duration: "处理时间",
        requestId: "请求ID",
        scrollRegion: "执行记录表",
        next: "后50条",
        emptyTitle: "没有符合条件的使用日志",
        emptyDescription: "请更改筛选条件，或在公开API执行后再次查看。",
      },
      detail: {
        back: "返回API使用日志",
        title: "API使用日志详情",
        request: "请求",
        normalizedJson: "规范化JSON",
        credentialNotice:
          "不保存认证标头、主叫电话号码标头、Idempotency-Key 和未经解析的请求正文。",
        response: "响应",
        httpStatus: "HTTP {status}",
        success: "成功",
        failure: "失败",
        json: "JSON",
        properties: "属性",
        requestedAt: "执行时间",
        apiKey: "API密钥",
        method: "方法",
        permission: "权限",
        status: "状态",
        duration: "处理时间",
        completedAt: "完成时间",
        requestId: "请求ID",
        idempotencyOutcome: "幂等结果",
        responseLocation: "Location",
        responseEtag: "ETag",
        notApplicable: "—",
        created: "已创建",
        requestCopyLabel: "复制请求JSON",
        requestCopied: "已复制请求JSON。",
        requestCopyFailed: "无法复制请求JSON。",
        responseCopyLabel: "复制响应JSON",
        responseCopied: "已复制响应JSON。",
        responseCopyFailed: "无法复制响应JSON。",
      },
    },
    cancel: "取消",
    saving: "处理中…",
    genericError: "操作失败，请重试。",
    conflictError: "与其他更改冲突，请重新加载后再试。",
  },
  "zh-Hant": {
    entry: "API金鑰管理",
    title: "預約API金鑰",
    description: "管理外部系統查詢、新增、修改及刪除預約所需的API金鑰與權限。",
    back: "返回預約系統",
    issue: "簽發API金鑰",
    readOnly: "簽發或撤銷金鑰及修改每月上限需要預約系統編輯權限。",
    usage: {
      title: "整體每月請求上限",
      description:
        "這是彙總所有預約API金鑰請求的自治體整體上限，同時也會套用各金鑰的個別上限。",
      change: "修改上限",
      limit: "目前上限",
      current: "本月使用量",
      remaining: "剩餘",
      unlimited: "無限制",
      resets: "將於{date}重設。",
    },
    api: {
      title: "公開API",
      description:
        "請在Authorization標頭中以Bearer形式指定API金鑰。建立、單筆查詢、更新及刪除時，請在 X-Reservation-Caller-Phone 傳送E.164格式的來電ANI，不得以使用者口述的號碼代替。建立時另需指定 Idempotency-Key，更新及刪除時另需指定 If-Match。",
      method: "方法",
      endpoint: "端點",
      permission: "權限",
      operation: "操作",
      descriptions: {
        LIST: "取得預約清單",
        READ: "取得指定預約",
        CREATE: "新增預約",
        UPDATE: "修改預約",
        DELETE: "刪除預約",
      },
      operations: {
        services: "取得服務清單",
        availability: "取得可用時段",
        list: "取得預約清單",
        read: "取得指定預約",
        create: "新增預約",
        replace: "取代預約",
        update: "修改預約",
        delete: "刪除預約",
      },
    },
    keys: {
      title: "已簽發API金鑰",
      description:
        "金鑰本身只會在簽發後顯示一次。可在此管理各API金鑰的每月上限與使用量。",
      name: "名稱",
      key: "API金鑰",
      nameKey: "名稱 / 金鑰",
      permissions: "權限",
      monthlyLimit: "每月上限",
      monthlyUsage: "本月使用量",
      status: "狀態",
      created: "簽發時間",
      lastUsed: "最後使用",
      actions: "操作",
      actionsFor: "操作：{name}",
      active: "有效",
      revoked: "已撤銷",
      never: "未使用",
      unlimited: "無限制",
      remaining: "剩餘",
      changeLimit: "修改上限",
      revoke: "撤銷",
      emptyTitle: "尚未簽發API金鑰",
      emptyDescription: "請為每個外部系統僅選擇必要權限後簽發。",
    },
    issueDialog: {
      title: "簽發API金鑰",
      description: "輸入用於識別外部系統的名稱並選擇允許的操作。",
      name: "API金鑰名稱",
      namePlaceholder: "例：預約整合系統",
      permissions: "權限",
      permissionsDescription: "請至少選擇一項。各項權限彼此獨立。",
      permissionError: "請至少選擇一項權限。",
      limitTitle: "單一金鑰每月請求上限",
      limitDescription: "指定此API金鑰的上限。整體上限也會另外套用。",
      limitLimitedDescription: "請設定為100次以上。",
      limitInputLabel: "每月上限",
      submit: "簽發",
      successTitle: "API金鑰已簽發",
      successDescription: "此金鑰無法再次顯示，請立即複製至安全位置。",
      keyLabel: "API金鑰",
      copy: "複製",
      copied: "API金鑰已複製。",
      close: "關閉",
    },
    revokeDialog: {
      title: "要撤銷API金鑰嗎？",
      description: "「{name}」將立即無法存取公開API，此操作無法撤銷。",
      confirm: "撤銷",
    },
    usageDialog: {
      title: "修改每月請求上限",
      description: "設定預約公開API每月接受的請求數。",
      limited: "設定上限",
      unlimited: "無限制",
      unit: "次",
      help: "最少100次。超過10,000時須以100為單位設定。",
      invalid: "請輸入不小於100的整數；超過10,000時須為100的倍數。",
      submit: "儲存",
    },
    keyUsageDialog: {
      title: "修改API金鑰每月上限",
      description: "設定「{name}」每月可使用的請求數。整體上限仍會繼續套用。",
      legend: "單一金鑰上限設定",
      limitedDescription: "僅套用於此API金鑰。",
      unlimited: "此金鑰無限制",
      unlimitedDescription: "仍會統計此金鑰的使用量，只套用整體上限。",
      issueUnlimitedDescription: "仍會統計使用量，只套用整體上限。",
      submit: "儲存",
    },
    logs: {
      entry: "查看使用紀錄",
      backToKeys: "返回API金鑰管理",
      title: "API使用紀錄",
      description: "查看預約公開API請求所使用的API金鑰、執行時間、端點及結果。",
      filter: {
        heading: "篩選使用紀錄",
        search: "搜尋",
        searchPlaceholder: "請求ID、API金鑰名稱或金鑰識別碼",
        method: "方法",
        result: "結果",
        all: "全部",
        success: "成功（2xx）",
        clientError: "用戶端錯誤（4xx）",
        serverError: "伺服器錯誤（5xx）",
        submit: "篩選",
      },
      list: {
        title: "執行紀錄",
        description: "依最新執行順序每次顯示50筆。",
        count: "{count}筆",
        requestedAt: "執行時間",
        apiKey: "執行API金鑰",
        method: "方法",
        api: "API",
        result: "結果",
        duration: "處理時間",
        requestId: "請求ID",
        scrollRegion: "執行紀錄表",
        next: "後50筆",
        emptyTitle: "沒有符合條件的使用紀錄",
        emptyDescription: "請變更篩選條件，或在公開API執行後再次查看。",
      },
      detail: {
        back: "返回API使用紀錄",
        title: "API使用紀錄詳細資料",
        request: "請求",
        normalizedJson: "正規化JSON",
        credentialNotice:
          "不會儲存驗證標頭、來電電話號碼標頭、Idempotency-Key 及未解析的請求本文。",
        response: "回應",
        httpStatus: "HTTP {status}",
        success: "成功",
        failure: "失敗",
        json: "JSON",
        properties: "屬性",
        requestedAt: "執行時間",
        apiKey: "API金鑰",
        method: "方法",
        permission: "權限",
        status: "狀態",
        duration: "處理時間",
        completedAt: "完成時間",
        requestId: "請求ID",
        idempotencyOutcome: "冪等結果",
        responseLocation: "Location",
        responseEtag: "ETag",
        notApplicable: "—",
        created: "已建立",
        requestCopyLabel: "複製請求JSON",
        requestCopied: "已複製請求JSON。",
        requestCopyFailed: "無法複製請求JSON。",
        responseCopyLabel: "複製回應JSON",
        responseCopied: "已複製回應JSON。",
        responseCopyFailed: "無法複製回應JSON。",
      },
    },
    cancel: "取消",
    saving: "處理中…",
    genericError: "操作失敗，請重試。",
    conflictError: "與其他變更衝突，請重新載入後再試。",
  },
  ko: {
    entry: "API 키 관리",
    title: "예약 API 키",
    description:
      "외부 시스템이 예약을 조회·등록·변경·삭제할 수 있는 API 키와 권한을 관리합니다.",
    back: "예약 시스템으로 돌아가기",
    issue: "API 키 발급",
    readOnly:
      "키 발급·폐기 및 월간 한도 변경에는 예약 시스템 편집 권한이 필요합니다.",
    usage: {
      title: "전체 월간 요청 한도",
      description:
        "모든 예약 API 키의 요청을 합산하는 지자체 전체 한도이며, 각 키의 개별 한도도 함께 적용됩니다.",
      change: "한도 변경",
      limit: "현재 한도",
      current: "이번 달 사용",
      remaining: "남음",
      unlimited: "한도 없음",
      resets: "{date}에 초기화됩니다.",
    },
    api: {
      title: "공개 API",
      description:
        "Authorization 헤더에 Bearer 형식으로 API 키를 지정합니다. 생성, 개별 조회, 변경 및 삭제 시 X-Reservation-Caller-Phone에 E.164 형식의 발신자 ANI를 전달하며, 사용자가 말한 번호로 대체하지 마세요. 생성 시 Idempotency-Key, 변경 및 삭제 시 If-Match도 필요합니다.",
      method: "메서드",
      endpoint: "엔드포인트",
      permission: "권한",
      operation: "작업",
      descriptions: {
        LIST: "예약 목록 조회",
        READ: "지정한 예약 조회",
        CREATE: "예약 등록",
        UPDATE: "예약 변경",
        DELETE: "예약 삭제",
      },
      operations: {
        services: "서비스 목록 조회",
        availability: "예약 가능 시간 조회",
        list: "예약 목록 조회",
        read: "지정한 예약 조회",
        create: "예약 등록",
        replace: "예약 교체",
        update: "예약 변경",
        delete: "예약 삭제",
      },
    },
    keys: {
      title: "발급된 API 키",
      description:
        "키 본문은 발급 직후 한 번만 표시됩니다. 각 API 키의 월간 한도와 사용량을 관리할 수 있습니다.",
      name: "이름",
      key: "API 키",
      nameKey: "이름 / 키",
      permissions: "권한",
      monthlyLimit: "월간 한도",
      monthlyUsage: "이번 달 사용",
      status: "상태",
      created: "발급 일시",
      lastUsed: "마지막 사용",
      actions: "작업",
      actionsFor: "작업: {name}",
      active: "활성",
      revoked: "폐기됨",
      never: "미사용",
      unlimited: "한도 없음",
      remaining: "남음",
      changeLimit: "한도 변경",
      revoke: "폐기",
      emptyTitle: "아직 발급된 API 키가 없습니다",
      emptyDescription: "외부 시스템별로 필요한 권한만 선택해 발급하세요.",
    },
    issueDialog: {
      title: "API 키 발급",
      description: "외부 시스템을 식별할 이름과 허용할 작업을 선택하세요.",
      name: "API 키 이름",
      namePlaceholder: "예: 예약 연동 시스템",
      permissions: "권한",
      permissionsDescription:
        "하나 이상 선택하세요. 각 권한은 서로 독립적입니다.",
      permissionError: "권한을 하나 이상 선택하세요.",
      limitTitle: "키별 월간 요청 한도",
      limitDescription:
        "이 API 키에 적용할 한도를 지정합니다. 전체 한도도 별도로 적용됩니다.",
      limitLimitedDescription: "100건 이상으로 설정하세요.",
      limitInputLabel: "월간 한도",
      submit: "발급",
      successTitle: "API 키가 발급되었습니다",
      successDescription:
        "이 키는 다시 표시되지 않습니다. 지금 안전한 위치에 복사하세요.",
      keyLabel: "API 키",
      copy: "복사",
      copied: "API 키를 복사했습니다.",
      close: "닫기",
    },
    revokeDialog: {
      title: "API 키를 폐기하시겠습니까?",
      description:
        "“{name}”은 즉시 공개 API에 접근할 수 없게 됩니다. 이 작업은 되돌릴 수 없습니다.",
      confirm: "폐기",
    },
    usageDialog: {
      title: "월간 요청 한도 변경",
      description: "예약 공개 API가 한 달 동안 받을 요청 수를 설정합니다.",
      limited: "한도 설정",
      unlimited: "한도 없음",
      unit: "건",
      help: "최소 100건. 10,000건을 초과하면 100건 단위로 설정하세요.",
      invalid:
        "100 이상의 정수를 입력하세요. 10,000을 초과하면 100의 배수여야 합니다.",
      submit: "저장",
    },
    keyUsageDialog: {
      title: "API 키 월간 한도 변경",
      description:
        "“{name}”이 한 달에 사용할 수 있는 요청 수를 설정합니다. 전체 한도도 계속 적용됩니다.",
      legend: "키별 한도 설정",
      limitedDescription: "이 API 키에만 적용됩니다.",
      unlimited: "이 키는 한도 없음",
      unlimitedDescription: "사용량은 계속 집계하고 전체 한도만 적용합니다.",
      issueUnlimitedDescription: "사용량은 집계하고 전체 한도만 적용합니다.",
      submit: "저장",
    },
    logs: {
      entry: "사용 로그 확인",
      backToKeys: "API 키 관리로 돌아가기",
      title: "API 사용 로그",
      description:
        "예약 공개 API 요청에 사용된 API 키, 실행 시간, 엔드포인트와 결과를 확인합니다.",
      filter: {
        heading: "사용 로그 필터",
        search: "검색",
        searchPlaceholder: "요청 ID, API 키 이름 또는 키 식별자",
        method: "메서드",
        result: "결과",
        all: "전체",
        success: "성공(2xx)",
        clientError: "클라이언트 오류(4xx)",
        serverError: "서버 오류(5xx)",
        submit: "필터",
      },
      list: {
        title: "실행 기록",
        description: "최신 실행 순으로 50건씩 표시합니다.",
        count: "{count}건",
        requestedAt: "실행 시간",
        apiKey: "실행 API 키",
        method: "메서드",
        api: "API",
        result: "결과",
        duration: "처리 시간",
        requestId: "요청 ID",
        scrollRegion: "실행 기록 표",
        next: "다음 50건",
        emptyTitle: "조건에 맞는 사용 로그가 없습니다",
        emptyDescription:
          "검색 조건을 변경하거나 공개 API 실행 후 다시 확인하세요.",
      },
      detail: {
        back: "API 사용 로그로 돌아가기",
        title: "API 사용 로그 상세",
        request: "요청",
        normalizedJson: "정규화된 JSON",
        credentialNotice:
          "인증 헤더, 발신자 전화번호 헤더, Idempotency-Key 및 파싱되지 않은 요청 본문은 저장하지 않습니다.",
        response: "응답",
        httpStatus: "HTTP {status}",
        success: "성공",
        failure: "실패",
        json: "JSON",
        properties: "속성",
        requestedAt: "실행 시간",
        apiKey: "API 키",
        method: "메서드",
        permission: "권한",
        status: "상태",
        duration: "처리 시간",
        completedAt: "완료 시간",
        requestId: "요청 ID",
        idempotencyOutcome: "멱등성 결과",
        responseLocation: "Location",
        responseEtag: "ETag",
        notApplicable: "—",
        created: "생성됨",
        requestCopyLabel: "요청 JSON 복사",
        requestCopied: "요청 JSON을 복사했습니다.",
        requestCopyFailed: "요청 JSON을 복사하지 못했습니다.",
        responseCopyLabel: "응답 JSON 복사",
        responseCopied: "응답 JSON을 복사했습니다.",
        responseCopyFailed: "응답 JSON을 복사하지 못했습니다.",
      },
    },
    cancel: "취소",
    saving: "처리 중…",
    genericError: "처리하지 못했습니다. 다시 시도하세요.",
    conflictError: "다른 변경과 충돌했습니다. 다시 불러온 후 시도하세요.",
  },
};

const reservationManagementCopy: Record<
  Locale,
  ReservationManagementDictionary
> = {
  ja: {
    apiKeys: reservationApiKeyCopy.ja,
    bookings: {
      entry: "予約一覧",
      back: "予約システムに戻る",
      title: "予約一覧",
      description:
        "予約システムで確定した予約を確認します。予約業務や予約種別で表示内容を絞り込めます。",
      unknownEndTime: "{time}（終了時刻未定）",
      filter: {
        heading: "予約一覧のフィルタ",
        service: "予約業務",
        allServices: "すべての予約業務",
        source: "予約種別",
        allSources: "すべての予約",
        zva: "ZVA予約（デモ除外）",
        demo: "デモ予約のみ",
        submit: "絞り込む",
      },
      list: {
        title: "確定予約",
        description: "作成日時の新しい順に50件ずつ表示します。",
        count: "{count}件",
        reservationDateTime: "予約日時",
        service: "予約業務",
        reservationId: "予約 ID",
        source: "予約種別",
        createdAt: "作成日時",
        scrollRegion: "予約一覧表",
        next: "次の50件",
        emptyTitle: "条件に一致する予約はありません",
        emptyDescription:
          "予約業務または予約種別を変更して、もう一度お試しください。",
      },
    },
    title: "予約システム",
    description: "自治体業務ごとの受付日と予約状況をカレンダーで確認します。",
    demoFill: "表示月のデモ予約を生成",
    serviceLabel: "予約業務",
    previousMonth: "前の月",
    currentMonth: "今月",
    nextMonth: "次の月",
    methods: { DATE: "日付予約", DATETIME: "日時予約" },
    facilityMethod: "施設利用枠",
    services: {
      "my-number-card": {
        name: "マイナンバーカード交付・更新",
        description:
          "平日の9:00から17:00まで、30分単位で来庁日時を予約できます。",
      },
      "legal-consultation": {
        name: "無料法律相談",
        description:
          "毎週水曜日の午後に、60分単位で弁護士相談枠を予約できます。",
      },
      "bulky-waste": {
        name: "粗大ごみ収集",
        description: "月曜日から土曜日まで、収集日を日単位で予約できます。",
      },
      "civic-facility": {
        name: "公民館・市民会館・会議室利用",
        description: "午前・午後・夜間の施設利用枠から予約できます。",
      },
    },
    weekdays: ["日", "月", "火", "水", "木", "金", "土"],
    statuses: {
      AVAILABLE: "空きあり",
      LIMITED: "残りわずか",
      FULL: "満員",
      UNAVAILABLE: "受付なし",
    },
    legend: "予約状況の凡例",
    availableTimes: "予約可能な時間を選択できます。",
    availableDate: "この日の収集予約状況です。",
    noSlots: "この日は予約を受け付けていません。",
    dateSlot: "収集日",
    bookedCount: "予約 {booked}/{capacity}件・残り {remaining}件",
    openSlotCount: "空き{count}枠",
    dateCount: "{booked}/{capacity}件",
    dateReservationSummary: "この日の予約情報です。",
    reservationListTitle: "予約一覧",
    reservationId: "予約 ID",
    createdAt: "作成日時",
    sources: { ZVA: "ZVA", DEMO: "デモ予約" },
    noReservations: "この日に確定している予約はありません。",
    slotAction: "予約一覧を確認",
    slotReservationDescription: "{date} {slot} の予約情報です。",
    close: "閉じる",
    readOnlyNotice: "デモ予約の生成には予約システムの編集権限が必要です。",
    generated: "表示月の4業務にデモ予約を生成しました。",
    loadingError: "予約状況を読み込めませんでした。もう一度お試しください。",
    generationError: "デモ予約を生成できませんでした。もう一度お試しください。",
  },
  en: {
    apiKeys: reservationApiKeyCopy.en,
    bookings: {
      entry: "Reservation list",
      back: "Back to the reservation system",
      title: "Reservations",
      description:
        "Review confirmed reservations and filter them by service or booking type.",
      unknownEndTime: "{time} (end time unavailable)",
      filter: {
        heading: "Filter reservations",
        service: "Service",
        allServices: "All services",
        source: "Booking type",
        allSources: "All reservations",
        zva: "ZVA reservations (exclude demos)",
        demo: "Demo reservations only",
        submit: "Filter",
      },
      list: {
        title: "Confirmed reservations",
        description: "Shows 50 reservations at a time, newest creation first.",
        count: "{count} results",
        reservationDateTime: "Reservation date and time",
        service: "Service",
        reservationId: "Reservation ID",
        source: "Booking type",
        createdAt: "Created",
        scrollRegion: "Reservation list table",
        next: "Next 50",
        emptyTitle: "No reservations match these conditions",
        emptyDescription: "Change the service or booking type and try again.",
      },
    },
    title: "Reservation system",
    description:
      "View appointment dates and availability for municipal services on a calendar.",
    demoFill: "Generate demo bookings for this month",
    serviceLabel: "Service",
    previousMonth: "Previous month",
    currentMonth: "Current month",
    nextMonth: "Next month",
    methods: { DATE: "Date booking", DATETIME: "Date and time booking" },
    facilityMethod: "Facility time slots",
    services: {
      "my-number-card": {
        name: "My Number card issuance and renewal",
        description:
          "Book a 30-minute visit between 9:00 and 17:00 on weekdays.",
      },
      "legal-consultation": {
        name: "Free legal consultation",
        description:
          "Book a 60-minute consultation between 13:00 and 16:00 on Wednesdays.",
      },
      "bulky-waste": {
        name: "Bulky waste collection",
        description: "Book a collection date from Monday through Saturday.",
      },
      "civic-facility": {
        name: "Civic halls and meeting rooms",
        description: "Book a morning, afternoon, or evening facility slot.",
      },
    },
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    statuses: {
      AVAILABLE: "Available",
      LIMITED: "Almost full",
      FULL: "Full",
      UNAVAILABLE: "Closed",
    },
    legend: "Availability legend",
    availableTimes: "Available times for this date.",
    availableDate: "Collection availability for this date.",
    noSlots: "Bookings are not accepted on this date.",
    dateSlot: "Collection date",
    bookedCount: "{booked}/{capacity} booked · {remaining} remaining",
    openSlotCount: "{count} slots open",
    dateCount: "{booked}/{capacity}",
    dateReservationSummary: "Reservation details for this date.",
    reservationListTitle: "Reservations",
    reservationId: "Reservation ID",
    createdAt: "Created",
    sources: { ZVA: "ZVA", DEMO: "Demo booking" },
    noReservations: "There are no confirmed reservations for this date.",
    slotAction: "View reservations",
    slotReservationDescription: "Reservation details for {date}, {slot}.",
    close: "Close",
    readOnlyNotice:
      "Edit permission for the reservation system is required to generate demo bookings.",
    generated:
      "Demo bookings were generated for all four services in this month.",
    loadingError: "Could not load availability. Please try again.",
    generationError: "Could not generate demo bookings. Please try again.",
  },
  "zh-Hans": {
    apiKeys: reservationApiKeyCopy["zh-Hans"],
    bookings: {
      entry: "预约列表",
      back: "返回预约系统",
      title: "预约列表",
      description: "查看预约系统中已确认的预约，并可按预约业务或预约类型筛选。",
      unknownEndTime: "{time}（结束时间未定）",
      filter: {
        heading: "预约列表筛选",
        service: "预约业务",
        allServices: "全部预约业务",
        source: "预约类型",
        allSources: "全部预约",
        zva: "ZVA预约（排除演示）",
        demo: "仅演示预约",
        submit: "筛选",
      },
      list: {
        title: "已确认预约",
        description: "按创建时间从新到旧，每次显示50条。",
        count: "{count}条",
        reservationDateTime: "预约日期时间",
        service: "预约业务",
        reservationId: "预约 ID",
        source: "预约类型",
        createdAt: "创建时间",
        scrollRegion: "预约列表表格",
        next: "后50条",
        emptyTitle: "没有符合条件的预约",
        emptyDescription: "请更改预约业务或预约类型后重试。",
      },
    },
    title: "预约系统",
    description: "通过日历查看各项市政服务的受理日期和预约情况。",
    demoFill: "生成本月演示预约",
    serviceLabel: "预约业务",
    previousMonth: "上个月",
    currentMonth: "本月",
    nextMonth: "下个月",
    methods: { DATE: "按日期预约", DATETIME: "按日期和时间预约" },
    facilityMethod: "设施使用时段",
    services: {
      "my-number-card": {
        name: "个人编号卡领取与更新",
        description: "工作日9:00至17:00可按30分钟预约到访。",
      },
      "legal-consultation": {
        name: "免费法律咨询",
        description: "每周三13:00至16:00可按60分钟预约咨询。",
      },
      "bulky-waste": {
        name: "大件垃圾收集",
        description: "周一至周六可按日期预约收集。",
      },
      "civic-facility": {
        name: "公民馆、市民会馆和会议室",
        description: "可预约上午、下午或晚间设施时段。",
      },
    },
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    statuses: {
      AVAILABLE: "有空位",
      LIMITED: "余位不多",
      FULL: "已满",
      UNAVAILABLE: "不受理",
    },
    legend: "预约状态图例",
    availableTimes: "请选择该日期可预约的时间。",
    availableDate: "该日期的收集预约情况。",
    noSlots: "该日期不受理预约。",
    dateSlot: "收集日期",
    bookedCount: "已预约 {booked}/{capacity}件・剩余 {remaining}件",
    openSlotCount: "空余{count}个时段",
    dateCount: "{booked}/{capacity}件",
    dateReservationSummary: "该日期的预约信息。",
    reservationListTitle: "预约列表",
    reservationId: "预约 ID",
    createdAt: "创建时间",
    sources: { ZVA: "ZVA", DEMO: "演示预约" },
    noReservations: "该日期没有已确认的预约。",
    slotAction: "查看预约列表",
    slotReservationDescription: "{date} {slot} 的预约信息。",
    close: "关闭",
    readOnlyNotice: "生成演示预约需要预约系统编辑权限。",
    generated: "已为本月全部4项业务生成演示预约。",
    loadingError: "无法加载预约情况，请重试。",
    generationError: "无法生成演示预约，请重试。",
  },
  "zh-Hant": {
    apiKeys: reservationApiKeyCopy["zh-Hant"],
    bookings: {
      entry: "預約清單",
      back: "返回預約系統",
      title: "預約清單",
      description: "查看預約系統中已確認的預約，並可按預約業務或預約類型篩選。",
      unknownEndTime: "{time}（結束時間未定）",
      filter: {
        heading: "預約清單篩選",
        service: "預約業務",
        allServices: "全部預約業務",
        source: "預約類型",
        allSources: "全部預約",
        zva: "ZVA預約（排除示範）",
        demo: "僅示範預約",
        submit: "篩選",
      },
      list: {
        title: "已確認預約",
        description: "按建立時間由新至舊，每次顯示50筆。",
        count: "{count}筆",
        reservationDateTime: "預約日期時間",
        service: "預約業務",
        reservationId: "預約 ID",
        source: "預約類型",
        createdAt: "建立時間",
        scrollRegion: "預約清單表格",
        next: "下50筆",
        emptyTitle: "沒有符合條件的預約",
        emptyDescription: "請更改預約業務或預約類型後再試。",
      },
    },
    title: "預約系統",
    description: "透過日曆查看各項市政服務的受理日期及預約狀況。",
    demoFill: "產生本月示範預約",
    serviceLabel: "預約業務",
    previousMonth: "上個月",
    currentMonth: "本月",
    nextMonth: "下個月",
    methods: { DATE: "按日期預約", DATETIME: "按日期及時間預約" },
    facilityMethod: "設施使用時段",
    services: {
      "my-number-card": {
        name: "個人編號卡領取及更新",
        description: "平日9:00至17:00可按30分鐘預約到訪。",
      },
      "legal-consultation": {
        name: "免費法律諮詢",
        description: "每週三13:00至16:00可按60分鐘預約諮詢。",
      },
      "bulky-waste": {
        name: "大型垃圾收集",
        description: "週一至週六可按日期預約收集。",
      },
      "civic-facility": {
        name: "公民館、市民會館及會議室",
        description: "可預約上午、下午或晚間設施時段。",
      },
    },
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    statuses: {
      AVAILABLE: "尚有空位",
      LIMITED: "名額將滿",
      FULL: "已額滿",
      UNAVAILABLE: "不受理",
    },
    legend: "預約狀況圖例",
    availableTimes: "請選擇該日期可預約的時間。",
    availableDate: "該日期的收集預約狀況。",
    noSlots: "該日期不受理預約。",
    dateSlot: "收集日期",
    bookedCount: "已預約 {booked}/{capacity}件・剩餘 {remaining}件",
    openSlotCount: "尚有{count}個時段",
    dateCount: "{booked}/{capacity}件",
    dateReservationSummary: "此日期的預約資訊。",
    reservationListTitle: "預約清單",
    reservationId: "預約 ID",
    createdAt: "建立時間",
    sources: { ZVA: "ZVA", DEMO: "示範預約" },
    noReservations: "此日期沒有已確認的預約。",
    slotAction: "查看預約清單",
    slotReservationDescription: "{date} {slot} 的預約資訊。",
    close: "關閉",
    readOnlyNotice: "產生示範預約需要預約系統編輯權限。",
    generated: "已為本月全部4項業務產生示範預約。",
    loadingError: "無法載入預約狀況，請重試。",
    generationError: "無法產生示範預約，請重試。",
  },
  ko: {
    apiKeys: reservationApiKeyCopy.ko,
    bookings: {
      entry: "예약 목록",
      back: "예약 시스템으로 돌아가기",
      title: "예약 목록",
      description:
        "예약 시스템에서 확정된 예약을 확인하고 예약 업무 또는 예약 유형으로 필터링할 수 있습니다.",
      unknownEndTime: "{time}(종료 시간 미정)",
      filter: {
        heading: "예약 목록 필터",
        service: "예약 업무",
        allServices: "모든 예약 업무",
        source: "예약 유형",
        allSources: "모든 예약",
        zva: "ZVA 예약(데모 제외)",
        demo: "데모 예약만",
        submit: "필터",
      },
      list: {
        title: "확정 예약",
        description: "생성 일시가 최신인 순으로 50건씩 표시합니다.",
        count: "{count}건",
        reservationDateTime: "예약 일시",
        service: "예약 업무",
        reservationId: "예약 ID",
        source: "예약 유형",
        createdAt: "생성 일시",
        scrollRegion: "예약 목록 표",
        next: "다음 50건",
        emptyTitle: "조건에 맞는 예약이 없습니다",
        emptyDescription:
          "예약 업무 또는 예약 유형을 변경한 후 다시 시도하세요.",
      },
    },
    title: "예약 시스템",
    description:
      "달력에서 지방자치단체 업무별 접수일과 예약 현황을 확인합니다.",
    demoFill: "표시 월의 데모 예약 생성",
    serviceLabel: "예약 업무",
    previousMonth: "이전 달",
    currentMonth: "이번 달",
    nextMonth: "다음 달",
    methods: { DATE: "날짜 예약", DATETIME: "날짜 및 시간 예약" },
    facilityMethod: "시설 이용 시간",
    services: {
      "my-number-card": {
        name: "마이넘버 카드 교부 및 갱신",
        description:
          "평일 9:00부터 17:00까지 30분 단위로 방문 시간을 예약할 수 있습니다.",
      },
      "legal-consultation": {
        name: "무료 법률 상담",
        description:
          "수요일 13:00부터 16:00까지 60분 단위로 상담을 예약할 수 있습니다.",
      },
      "bulky-waste": {
        name: "대형 폐기물 수거",
        description: "월요일부터 토요일까지 수거일을 예약할 수 있습니다.",
      },
      "civic-facility": {
        name: "공민관·시민회관·회의실 이용",
        description:
          "오전, 오후 또는 야간 시설 이용 시간을 예약할 수 있습니다.",
      },
    },
    weekdays: ["일", "월", "화", "수", "목", "금", "토"],
    statuses: {
      AVAILABLE: "예약 가능",
      LIMITED: "잔여 소수",
      FULL: "마감",
      UNAVAILABLE: "접수 없음",
    },
    legend: "예약 현황 범례",
    availableTimes: "이 날짜에 예약 가능한 시간을 선택할 수 있습니다.",
    availableDate: "이 날짜의 수거 예약 현황입니다.",
    noSlots: "이 날짜에는 예약을 받지 않습니다.",
    dateSlot: "수거일",
    bookedCount: "예약 {booked}/{capacity}건・잔여 {remaining}건",
    openSlotCount: "빈 시간 {count}개",
    dateCount: "{booked}/{capacity}건",
    dateReservationSummary: "이 날짜의 예약 정보입니다.",
    reservationListTitle: "예약 목록",
    reservationId: "예약 ID",
    createdAt: "생성 일시",
    sources: { ZVA: "ZVA", DEMO: "데모 예약" },
    noReservations: "이 날짜에 확정된 예약이 없습니다.",
    slotAction: "예약 목록 확인",
    slotReservationDescription: "{date} {slot}의 예약 정보입니다.",
    close: "닫기",
    readOnlyNotice:
      "데모 예약을 생성하려면 예약 시스템 편집 권한이 필요합니다.",
    generated: "표시 월의 4개 업무에 데모 예약을 생성했습니다.",
    loadingError: "예약 현황을 불러올 수 없습니다. 다시 시도해 주세요.",
    generationError: "데모 예약을 생성할 수 없습니다. 다시 시도해 주세요.",
  },
};

/**
 * 業種非依存の共通クローム文言。業種ごとに内容が変わる文言は
 * app/tenants/<key>/content.ts のコンテンツパックが持ち、
 * buildDictionary() が両者を合成して {@link Dictionary} を作る。
 */
export const chromeDictionaries: Record<Locale, ChromeDictionary> = {
  ja: {
    nav: {
      access: "アクセス・施設案内",
      language: "言語",
      openMenu: "メニューを開く",
      closeMenu: "メニューを閉じる",
    },
    theme: {
      light: "ライト",
      dark: "ダーク",
    },
    maintenance: {
      title: "Web サイト メンテナンス中",
      description:
        "この Web サイトは現在、予定メンテナンス中です。間もなく復旧いたします。",
    },
    findInfo: {
      title: "情報を探す",
      subtitle: "Find information",
      sectionLabel: "Zoom AI に相談",
      call: {
        title: "AI 電話相談",
        description:
          "相談内容を AI が一次対応を行い、高度なご相談や個人情報に関わるご相談は有人オペレーターにお繋ぎします。",
        unavailableAlert: "AI 電話相談の電話番号が設定されていません。",
      },
    },
    news: {
      title: "お知らせ",
      subtitle: "Information",
      more: "もっと見る",
      close: "閉じる",
      category: { new: "新着情報", featured: "注目情報" },
    },
    contentPages: {
      breadcrumbLabel: "パンくずリスト",
      tableOfContents: "目次",
      home: "ホーム",
      newsIndexTitle: "お知らせ",
      allNews: "お知らせ一覧",
      categoryLead: "「{name}」に関する主な情報をご案内します。",
      topicCardLead: "「{name}」の概要や手続きのポイントをご案内します。",
      topicLead:
        "「{name}」の概要と、手続き・利用時に確認したいポイントをご案内します。",
      topicsHeading: "主な情報",
      overviewHeading: "概要",
      checkHeading: "確認すること",
      checkEligibility: "対象となる方",
      checkDocuments: "必要なもの",
      checkHowToUse: "利用・手続き方法",
      checkEligibilityDescription:
        "対象年齢、居住要件、受付期間など、案内ごとの条件をご確認ください。条件の記載がない情報は、そのままご利用いただけます。",
      checkDocumentsDescription:
        "申請や予約を伴う場合は、本人確認書類や当日の持ち物など、必要なものを事前にご確認ください。",
      checkHowToUseDescription:
        "掲載内容をご確認のうえ、必要に応じてオンライン、窓口、電話から手続きや相談を行ってください。",
      newsScopeHeading: "対象・影響範囲",
      newsScopeDescription:
        "このお知らせの対象となる方や地域、影響する手続き・サービスをご確認ください。",
      newsConfirmationHeading: "確認事項",
      newsConfirmationDescription:
        "実施時期、条件、注意点など、お知らせの内容に応じて必要な情報をご確認ください。",
      newsActionHeading: "次の行動",
      newsActionDescription:
        "申請、予約、相談、最新状況の確認など、お知らせに記載された案内に沿って対応してください。",
      contactHeading: "お問い合わせ",
      contactPhoneLabel: "電話",
      backToCategory: "このカテゴリに戻る",
      publishedLabel: "公開日",
      readMore: "詳しく見る",
      faq: {
        indexLead: "未来市のよくある質問を課・局別にご案内します。",
        departmentsHeading: "課・局から探す",
        departmentLead:
          "「{name}」に関するよくある質問をカテゴリ別にご案内します。",
        categoriesHeading: "FAQカテゴリ",
        categoryLead: "「{name}」に関するよくある質問と回答をご案内します。",
        questionsHeading: "よくある質問",
        questionCount: "{count}件の質問",
        backToIndex: "よくある質問一覧に戻る",
        backToDepartment: "この課・局のFAQ一覧に戻る",
      },
    },
    footer: {
      terms: "利用規約",
      privacy: "プライバシーポリシー",
      feedback: "ご意見・ご要望",
      sitemap: "サイトマップ",
      login: "ログイン",
      goToAdmin: "管理画面",
      phoneLabel: "電話番号：",
      phoneNote: "（代表）",
    },
    docs: {
      viewAsMarkdown: "Markdown 版を表示",
    },
    links: {
      opensInNewTab: "新しいタブで開きます",
    },
    auth: {
      loginTitle: "管理ログイン",
      loginDescription:
        "記事作成や電話番号変更など、デモ運用者向けの管理機能にアクセスします。",
      email: "メールアドレス",
      password: "パスワード",
      currentPassword: "現在のパスワード",
      newPassword: "新しいパスワード",
      showPassword: "パスワードを表示",
      hidePassword: "パスワードを非表示",
      name: "氏名",
      role: "権限",
      roleUser: "一般ユーザー",
      roleAdmin: "管理者",
      login: "ログイン",
      signOut: "ログアウト",
      forgotPassword: "パスワード再設定を申請",
      forgotPasswordTitle: "パスワード再設定申請",
      forgotPasswordDescription:
        "管理者が申請を確認し、新しい仮パスワードを発行します。",
      requestReset: "再設定を申請",
      resetRequestSent:
        "申請を受け付けました。管理者からの案内をお待ちください。",
      changePasswordTitle: "パスワード変更",
      changePasswordDescription:
        "仮パスワードでログインした場合は、続行前に新しいパスワードへ変更してください。",
      changePassword: "パスワードを変更",
      passwordChanged: "パスワードを変更しました。",
      temporaryPassword: "仮パスワード",
      temporaryPasswordDescription:
        "この仮パスワードは一度だけ表示されます。安全な方法で対象ユーザーに共有してください。",
      copyTemporaryPassword: "仮パスワードをコピー",
      temporaryPasswordCopied: "仮パスワードをコピーしました。",
      temporaryPasswordCopyFailed:
        "コピーできませんでした。仮パスワードを選択してコピーしてください。",
      required: "必須",
      error: "処理に失敗しました。",
    },
    admin: {
      industrySettings: {
        openUniversitySettings: "大学の設定を開く",
        saveError: "保存できませんでした。入力内容を保持しています。もう一度お試しください。",
        saving: "保存中...",
        pageHelpLabel: "ページの説明",
        pageHelpDescription: "選択した業種の{title}の設定を編集します。",
        placeholder: "業種を選択",
        "label": "設定対象の業種",
        "help": "このページで編集する業種を選択します。",
        "scope": "{tenant}の、このページのすべてのタブの設定を保存します。",
        "saved": "{tenant}の設定を保存しました。",
        "dirty": "未保存の変更があります。",
        "loading": "{tenant}の設定を読み込んでいます。",
        "loadError": "{tenant}の設定を読み込めませんでした。",
        "retry": "再読み込み",
        "readonly": "閲覧のみ可能です。編集権限がありません。",
        "invalid": "指定された業種は利用できません。",
        "continue": "編集を続ける",
        "discard": "変更を破棄して切り替える",
        "confirmTitle": "未保存の変更を破棄しますか？",
        "confirmTenant": "{tenant}の変更は保存されていません。{destination}に切り替えると、入力した変更が失われます。",
        "confirmPage": "{tenant}の変更は保存されていません。{destination}に移動すると、入力した変更が失われます。",
        "consultationTitle": "オンライン相談管理",
        "consultationDescription": "選択した業種のオンライン相談窓口に、接続用Webタグを設定します。",
        "consultationConnectionLabel": "{service}の接続設定",
        "consultationTagDescription": "オンライン相談サービスで発行した接続用Webタグを設定します。",
        "tag": "接続用Webタグ",
        "tagHelp": "仕様に適合する接続用Webタグだけを受け付けます。",
        "memo": "管理メモ",
        "invalidInput": "入力内容を確認してください。",
        "names": {
          "lg": "自治体（未来市）",
          "univ": "大学（未来大学）"
        },
        "services": {
          "general": "総合相談",
          "admissions": "入学・入試",
          "student-support": "学生生活・奨学金",
          "careers": "キャリア"
        }
      },
      title: "管理画面",
      pageDescriptionLabel: "{title}について",
      users: "ユーザー管理",
      newUser: "ユーザー作成",
      createUserAction: "作成",
      passwordResets: "再設定申請",
      phoneSettings: "電話管理",
      chatSettings: "AIチャット管理",
      onlineConsultation: "オンライン相談",
      languageSettings: "言語管理",
      maintenanceSettings: "メンテナンス管理",
      developerApi: "Developer API",
      reservations: "予約システム",
      settingsMenu: "設定",
      navigation: {
        usersSection: "ユーザー",
        settingsSection: "設定",
        usersSectionNavigation: "ユーザー管理セクション",
        settingsSectionNavigation: "設定管理セクション",
        backToSite: "公開サイトへ戻る",
        openMenu: "ナビゲーションを開く",
        closeMenu: "ナビゲーションを閉じる",
        collapseSidebar: "サイドナビゲーションを折りたたむ",
        expandSidebar: "サイドナビゲーションを展開する",
        accountMenuLabel: "アカウント操作",
        openAccountMenu: "{name}のアカウントメニューを開く",
        closeAccountMenu: "{name}のアカウントメニューを閉じる",
      },
      reservationManagement: reservationManagementCopy.ja,
      zaad: zaadDictionaries.ja,
      userListTitle: "ユーザー管理",
      searchPlaceholder: "氏名またはメールアドレスで検索",
      search: "検索",
      clear: "クリア",
      createUserTitle: "管理者によるユーザー作成",
      createUserDescription:
        "初回ログイン用の仮パスワードを発行し、初回ログイン後に変更を強制します。",
      createUser: "ユーザーを作成",
      email: "メールアドレス",
      name: "氏名",
      role: "権限",
      mustChangePassword: "要パスワード変更",
      createdAt: "作成日時",
      status: "状態",
      requestedAt: "申請日時",
      reviewedAt: "確認日時",
      approve: "承認",
      reject: "却下",
      pending: "未対応",
      approved: "承認済み",
      rejected: "却下済み",
      consumed: "変更済み",
      noUsers: "該当するユーザーはいません。",
      noResetRequests: "パスワード再設定申請はありません。",
      page: "ページ",
      paginationLabel: "ユーザー一覧のページ",
      previous: "前へ",
      next: "次へ",
      issuedPasswordTitle: "仮パスワードを発行しました",
      issuedPasswordDescription:
        "この画面を閉じると再表示できません。共有後はユーザーにログインと変更を依頼してください。",
      adminOnly: "管理者のみアクセスできます。",
      myPage: {
        title: "マイページ",
        description: "ログイン中のアカウント情報を確認できます。",
        name: "名前",
        email: "メールアドレス",
        noAccess: "現在、利用できる管理機能はありません。利用が必要な場合は管理者にお問い合わせください。",
        denied: "このページにアクセスする権限がありません。",
      },
      accessControl: {
        rolesNav: "ロール",
        listTitle: "ロール",
        listDescription:
          "ロールごとに管理ページへのアクセスを制御します。明示的な拒否は許可より優先されます。",
        roleCount: "ロール",
        addRole: "ロールを追加",
        createTitle: "ロールを追加",
        createDescription:
          "ロール名と説明を入力します。すべての管理ページ権限は未選択で作成されます。",
        roleName: "ロール名",
        roleNameRequired: "ロール名を入力してください。",
        roleNameTooLong: "ロール名は64文字以内で入力してください。",
        roleDescription: "説明",
        descriptionOptional: "説明（任意）",
        memberCount: "メンバー数",
        actions: "アクション",
        edit: "編集",
        editRoleTitle: "ロールを編集",
        editRoleDescription: "ロール名と説明を編集します。",
        systemRole: "システムロール",
        systemRoleReadOnly: "システムロールは変更できません。",
        noRoles: "ロールはありません。",
        cancel: "キャンセル",
        add: "追加",
        saving: "保存中…",
        save: "保存",
        saved: "ロール設定を保存しました。",
        reload: "最新情報を再読み込み",
        deleteRole: "ロールを削除",
        backToRoles: "ロール一覧へ戻る",
        backToUserDetails: "ユーザー詳細へ戻る",
        settingsTab: "ロール設定",
        membersTab: "ロールメンバー",
        adminPageAccessTitle: "管理ページのアクセス権",
        adminPageAccessDescription:
          "「表示」を外すと、同じ管理ページの追加・編集・削除も許可されません。",
        adminPageColumn: "管理ページ",
        allow: "許可",
        deny: "拒否",
        unset: "未設定",
        unsupported: "対象外",
        path: "パス",
        targetPaths: "対象パス",
        assignedRoles: "割り当てロール",
        noAssignedRoles: "割り当てられたロールはありません。",
        effectiveAccess: "実効アクセス",
        userAccessPageTitle: "ユーザーアクセス | 未来市 管理画面",
        userAccessTitle: "ユーザーの実効アクセス",
        userAccessHeading: "{name}のアクセス",
        userAccessDescription:
          "割り当てられた1つのアクセスロールと管理者権限の追加条件を反映した最終結果です。",
        viewAccess: "アクセスを確認",
        allowed: "許可",
        denied: "拒否",
        genericError: "ロールを処理できませんでした。",
        conflictError: "他の変更と競合しました。再読み込みしてお試しください。",
        duplicateError: "同じ名前のロールが既にあります。",
        listSearchPlaceholder: "ロール名またはIDで検索",
        memberSearchPlaceholder: "氏名、メールアドレス、IDでメンバーを検索",
        candidateSearchPlaceholder: "氏名、メールアドレス、IDで追加対象を検索",
        assignUsers: "ユーザーを追加",
        assign: "割り当て",
        removeAssignment: "割り当てを解除",
        noMembers: "このロールに割り当てられたユーザーはいません。",
        noCandidates: "追加できるユーザーはいません。",
        candidateDialogTitle: "ロールメンバーを追加",
        candidateDialogDescription:
          "選択したユーザーの現在のアクセスロールを置き換えます。",
        deleteRoleTitle: "ロールを削除しますか？",
        deleteRoleDescription:
          "ロールと権限設定は完全に削除され、元に戻せません。",
        roleInUse: "メンバーの割り当てをすべて解除すると削除できます。",
        readOnlyRoleAction: "この操作を行う権限がありません。",
        adminAttributeHelp:
          "管理ユーザーに対する操作の追加条件として使用します。",
        assignedRolesHelp:
          "管理ページごとの表示・追加・編集・削除を決定します。ユーザーが持てるロールは1つです。",
        accessRoleSummaryHelp:
          "管理ページごとの表示・追加・編集・削除を決定します。",
        replaceAccessRoleHelp:
          "保存すると現在のアクセスロールを選択した1つのロールへ置き換えます。",
        loading: "読み込み中…",
        accountSuspended:
          "ユーザーが停止中のため、すべてのアクセスが拒否されます。",
        passwordChangeRequired:
          "初回パスワード変更が完了するまで、すべてのアクセスが拒否されます。",
        systemRoleNames: {
          FULL_ACCESS: "全権アクセス",
          NO_ACCESS: "アクセスなし",
        },
        systemRoleDescriptions: {
          FULL_ACCESS: "対応するすべての管理アクションを許可します。",
          NO_ACCESS: "権限を付与せず、すべての操作を暗黙的に拒否します。",
        },
        resourceTitles: {
          users: "管理ユーザー",
          "password-reset-requests": "パスワード再設定申請",
          roles: "ロール管理",
          "role-assignments": "ロールメンバー",
          "phone-settings": "電話設定",
          "chat-settings": "AIチャット設定",
          "language-settings": "言語設定",
          "maintenance-settings": "メンテナンス設定",
          "developer-api": "Developer API",
          reservations: "予約システム",
          zaad: "AutoReach",
        },
        resourceDescriptions: {
          users:
            "管理ユーザーの一覧・詳細、作成、権限変更、停止、再開、削除、パスワード再設定、アクセス概要を扱います。",
          "password-reset-requests": "申請の表示、承認、却下を扱います。",
          roles: "アクセスロール、説明、権限設定を扱います。",
          "role-assignments":
            "ユーザーの単一アクセスロールの表示と変更を扱います。",
          "phone-settings": "代表電話番号とAI電話番号を扱います。",
          "chat-settings": "Web Chatの動作モードと接続設定を扱います。",
          "language-settings": "公開サイトの利用言語と表示順を扱います。",
          "maintenance-settings": "環境別モードとスケジュールを扱います。",
          "developer-api": "外部連携用のAPIとWebhook認証情報を管理します。",
          reservations: "自治体業務の予約状況を閲覧し、デモ予約を生成します。",
          zaad: "防災行政無線の登録住民、発信メッセージ、連絡先リスト、キャンペーンを管理します。",
        },
        actionLabels: {
          VIEW: "表示",
          CREATE: "追加",
          UPDATE: "編集",
          DELETE: "削除",
        },
      },
      userManagement: {
        detailsPageTitle: "ユーザー詳細 | 未来市 管理画面",
        detailsTitle: "ユーザー詳細",
        detailsDescription:
          "ユーザー情報、権限、アクセスロール、パスワードを管理します。",
        detailsReadOnly:
          "ユーザー情報は閲覧のみです。変更にはユーザーの編集権限が必要です。",
        name: "名前",
        accessRoles: "アクセスロール",
        backToUsers: "ユーザー管理へ戻る",
        settings: "設定",
        actionsFor: "設定対象",
        edit: "編集",
        suspend: "停止",
        reactivate: "再開",
        delete: "削除",
        active: "有効",
        suspended: "停止",
        save: "保存",
        saving: "保存中…",
        cancel: "キャンセル",
        saved: "変更を保存しました。",
        password: "パスワード",
        resetPassword: "再設定",
        passwordConfigured: "設定済み",
        passwordChangeRequired: "次回ログイン後に変更が必要",
        passwordVisibilityHelp: "本人以外のパスワードは表示できません。",
        selfPasswordResetProtected:
          "自分のパスワードはパスワード変更画面から変更してください。",
        passwordMode: "パスワードの種類",
        temporaryPasswordMode: "一時パスワード",
        temporaryPasswordModeDescription:
          "次回ログイン後にユーザー自身による変更を求めます。",
        standardPasswordMode: "通常パスワード",
        standardPasswordModeDescription:
          "管理者が設定したパスワードをそのまま利用できます。",
        newPassword: "新しいパスワード",
        confirmPassword: "新しいパスワード（確認）",
        passwordsMatch: "パスワードが一致しています。",
        passwordRequirements: "12文字以上128文字以下で入力してください。",
        generateTemporaryPassword: "一時パスワードを自動生成",
        revokeSessions: "変更後に強制ログアウトする",
        revokeSessionsDescription:
          "有効にすると、対象ユーザーのログイン中セッションをすべて終了します。",
        enabled: "する",
        disabled: "しない",
        passwordDialogTitle: "パスワードを再設定しますか？",
        passwordDialogDescription:
          "内容を確認してパスワードを再設定してください。この操作後、以前のパスワードは使用できません。",
        confirmPasswordReset: "パスワードを再設定",
        passwordResetSaved: "パスワードを再設定しました。",
        selfProtected: "自分自身にはこの操作を実行できません。",
        lastAdminProtected: "最後の有効な管理者にはこの操作を実行できません。",
        emailDialogTitle: "メールアドレスを変更しますか？",
        emailDialogDescription:
          "変更後は新しいメールアドレスがログインに使用されます。内容を確認して変更してください。",
        currentEmail: "現在のメールアドレス",
        newEmail: "新しいメールアドレス",
        changeEmail: "メールアドレスを変更",
        suspendDialogTitle: "ユーザーを停止しますか？",
        suspendDialogDescription:
          "ユーザーのログイン中セッションは終了し、再開するまでログインできなくなります。",
        reactivateDialogTitle: "ユーザーを再開しますか？",
        reactivateDialogDescription:
          "停止を解除し、このユーザーが再びログインできるようにします。",
        deleteDialogTitle: "ユーザーを削除しますか？",
        deleteDialogDescription:
          "ユーザーと認証情報は完全に削除されます。この操作は取り消せません。",
        targetUser: "対象ユーザー",
        errors: {
          AUTHENTICATION_REQUIRED: "ログインが必要です。",
          ADMINISTRATOR_REQUIRED: "管理者権限が必要です。",
          PASSWORD_CHANGE_REQUIRED: "先にパスワードを変更してください。",
          INVALID_REQUEST: "リクエストの内容が正しくありません。",
          INVALID_NAME: "氏名を入力してください。",
          INVALID_EMAIL: "有効なメールアドレスを入力してください。",
          EMAIL_ALREADY_EXISTS: "このメールアドレスは既に使用されています。",
          INVALID_ROLE: "有効な権限を選択してください。",
          INVALID_PASSWORD:
            "パスワードは12文字以上128文字以下で入力してください。",
          PASSWORD_MISMATCH: "確認用パスワードが一致していません。",
          USER_NOT_FOUND: "対象ユーザーが見つかりません。",
          SELF_PROTECTED: "自分自身にはこの操作を実行できません。",
          LAST_ACTIVE_ADMIN: "最後の有効な管理者にはこの操作を実行できません。",
          UPDATE_FAILED: "ユーザー情報を更新できませんでした。",
          SUSPEND_FAILED: "ユーザーを停止できませんでした。",
          REACTIVATE_FAILED: "ユーザーを再開できませんでした。",
          DELETE_FAILED: "ユーザーを削除できませんでした。",
          RESET_PASSWORD_FAILED: "パスワードを再設定できませんでした。",
          SESSION_REVOCATION_FAILED:
            "パスワードは変更されましたが、ログイン中セッションを終了できませんでした。",
        },
      },
      settings: {
        save: "設定を保存",
        saving: "保存中…",
        saved: "設定を保存しました。",
        saveError: "設定を保存できませんでした。",
        pageSaveScope: "このページのすべてのタブの設定を保存します。",
        sectionSaveScope: "このセクションの設定を保存します。",
        errors: {
          AUTHENTICATION_REQUIRED: "ログインが必要です。",
          ADMINISTRATOR_REQUIRED: "管理者権限が必要です。",
          PASSWORD_CHANGE_REQUIRED:
            "設定を変更する前にパスワードを変更してください。",
          INVALID_REQUEST: "入力内容を確認してください。",
          INVALID_REPRESENTATIVE_PHONE_DISPLAY:
            "代表電話の表示値に使用できない文字が含まれています。",
          INVALID_REPRESENTATIVE_PHONE_E164:
            "代表電話の発信用番号をE.164形式で入力してください。",
          INVALID_AI_PHONE_E164: "AI電話番号をE.164形式で入力してください。",
          INVALID_ZOOM_CAMPAIGN_WEB_TAG:
            "Campaign欄には、ZoomのCampaign設定から発行された有効なWeb Tagを入力してください。",
          INVALID_ZOOM_CONTACT_CENTER_WEB_TAG:
            "Contact Center Entry ID欄には、data-chat-entry-idを含む有効なWeb Tagを入力してください。",
          ACTIVE_ZOOM_CHAT_TAG_REQUIRED:
            "選択したチャット方式のWeb Tagを入力してください。",
          INVALID_CHAT_MEMO: "管理用メモは4,000文字以内で入力してください。",
          INVALID_LANGUAGE_SETTINGS: "5言語を重複なく1回ずつ指定してください。",
          JAPANESE_REQUIRED: "日本語は無効にできません。",
          SETTINGS_SAVE_FAILED: "設定を保存できませんでした。",
        },
      },
      phoneManagement: {
        title: "電話管理",
        description:
          "代表電話と、公開サイトの言語ごとに利用するAI電話相談番号を設定します。",
        representativeTitle: "代表電話",
        representativeDescription:
          "共通フッターに表示する電話番号と、発信に使用する番号を設定します。",
        representativeDisplayLabel: "表示用電話番号",
        representativeDisplayHelp: "例：(03)1234-5678",
        representativeE164Label: "発信用電話番号（E.164）",
        representativeE164Help: "例：+81312345678",
        aiPhoneTitle: "AI 電話相談",
        aiPhoneDescription:
          "公開サイトで選択中の言語に応じて発信する電話番号を設定します。空欄の場合は未設定として保存されます。",
        aiPhoneLabel: "AI電話番号（E.164）",
        hidden: "非表示中",
      },
      developerApiManagement: {
        title: "Developer API",
        description:
          "外部連携に使用する認証情報とWebhookのSecret Tokenを設定します。",
        oauthTitle: "Server To Server OAuth",
        oauthDescription: "Zoom API接続に使用する認証情報を設定します。",
        webhookTitle: "Webhook Only app",
        webhookDescription: "Webhookの検証に使用するSecret Tokenを設定します。",
        accountId: "Account ID",
        clientId: "Client ID",
        clientSecret: "Client Secret",
        secretToken: "Secret Token",
        errors: {
          DEVELOPER_API_INVALID_REQUEST: "入力内容を確認してください。",
          DEVELOPER_API_INVALID_ACCOUNT_ID:
            "Account IDは1〜255文字で入力してください。",
          DEVELOPER_API_INVALID_CLIENT_ID:
            "Client IDは1〜255文字で入力してください。",
          DEVELOPER_API_OAUTH_SECRET_REQUIRED:
            "Server-To-Server OAuthの初回保存時はClient Secretが必要です。",
          DEVELOPER_API_WEBHOOK_SECRET_REQUIRED:
            "Webhook only appの初回保存時はSecret Tokenが必要です。",
          DEVELOPER_API_ENCRYPTION_UNAVAILABLE:
            "暗号化設定を利用できないため保存できません。",
          DEVELOPER_API_SECRET_NOT_CONFIGURED:
            "表示できるSecretが設定されていません。",
          DEVELOPER_API_SECRET_REVEAL_FAILED: "Secretを表示できませんでした。",
          DEVELOPER_API_SAVE_FAILED:
            "Developer API設定を保存できませんでした。",
        },
      },
      chatManagement: {
        title: "AIチャット管理",
        description:
          "公開サイトで利用するZoomチャット方式と、それぞれのWeb Tagを設定します。非選択側の設定も保存されます。",
        methodTab: "利用方式",
        campaignTab: "キャンペーン",
        activeModeTitle: "公開サイトで利用する方式",
        activeModeDescription:
          "利用する方式を一つ選択してください。方式を切り替えても、CampaignとEntry IDの入力値は保持されます。",
        active: "使用中",
        inactive: "未使用",
        modes: {
          disabled: {
            label: "利用しない",
            description:
              "公開サイトでZoomチャットSDKを読み込みません。保存済みのタグは保持されます。",
          },
          campaign: {
            label: "Campaign",
            description:
              "Zoom Campaignで設定した対象URLや配信条件に従ってチャットを表示します。",
          },
          contactCenterEntryId: {
            label: "Contact Center Entry ID",
            description:
              "指定したContact Center FlowのEntry IDを使ってチャットを開始します。",
          },
        },
        campaign: {
          title: "Campaign",
          description:
            "Zoom管理画面の「Contact Center Management > Campaigns > Embed Web Tag」からコピーしたタグを設定します。",
          webTagLabel: "Campaign Web Tag（Embed Web Tag）",
          webTagHelp:
            "scriptタグ全体を貼り付けてください。この欄ではdata-chat-entry-idを含むタグは使用できません。",
          memoLabel: "Campaign メモ（任意）",
          memoHelp:
            "管理者向けの内部メモです。公開サイトの表示や動作には使用されません（最大4,000文字）。",
        },
        contactCenterEntryId: {
          title: "Contact Center Entry ID",
          description:
            "対象Flowの「Start > Manage Entry Point > Import SDK」からコピーしたタグを設定します。",
          webTagLabel: "Contact Center Web Tag（Import SDK）",
          webTagHelp:
            "scriptタグ全体を貼り付けてください。この欄のタグにはdata-chat-entry-idが必要です。",
          memoLabel: "Contact Center メモ（任意）",
          memoHelp:
            "管理者向けの内部メモです。公開サイトの表示や動作には使用されません（最大4,000文字）。",
        },
      },
      languageManagement: {
        title: "言語管理",
        description:
          "公開サイトの言語メニューに表示する言語と、その並び順を設定します。",
        enabledCountLabel: "表示する言語数",
        japaneseRequired: "必須",
        moveUp: "上へ",
        moveDown: "下へ",
      },
      maintenanceManagement: {
        title: "メンテナンス管理",
        description:
          "公開サイトの表示を、通常公開・即時メンテナンス・日時予約から選択します。",
        environmentLabel: "対象環境",
        environments: {
          production: "本番",
          preview: "プレビュー",
          development: "開発",
        },
        effectiveStateTitle: "現在の実効状態",
        effectiveActive: "メンテナンス中",
        effectiveInactive: "通常公開中",
        effectiveUnknown: "判定できません",
        currentValueUnavailableTitle: "現在の設定を取得できません",
        currentValueUnavailableDescription:
          "誤った設定で公開状態を変更しないよう、入力と保存を無効にしています。時間をおいて再読み込みしてください。",
        modeTitle: "公開モード",
        modeDescription: "公開サイトに適用するモードを一つ選択してください。",
        modes: {
          disabled: {
            label: "通常公開",
            description: "公開サイトの通常コンテンツを表示します。",
          },
          enabled: {
            label: "今すぐメンテナンス",
            description: "保存後、公開サイトをメンテナンス画面へ切り替えます。",
          },
          scheduled: {
            label: "日時予約",
            description:
              "指定した開始日時から終了日時までメンテナンス画面を表示します。",
          },
        },
        scheduleTitle: "予約日時",
        scheduleDescription:
          "日時予約を選択した場合に使用します。別のモードへ切り替えても保存済みの日時は保持されます。",
        scheduledStartLabel: "開始日時（JST）",
        scheduledEndLabel: "終了日時（JST）",
        timeZoneNote: "日時は日本標準時（JST）で入力してください。",
        scheduleRequired: "開始日時と終了日時を入力してください。",
        scheduleOrderError: "終了日時は開始日時より後にしてください。",
        scheduleEndFutureError: "終了日時は現在より後にしてください。",
        conflictError:
          "別の管理者が設定を更新しました。入力内容は保持されています。ページを再読み込みして最新の設定を確認してから、もう一度保存してください。",
        warningTitle: "公開サイトの表示が切り替わります",
        warningDescription:
          "メンテナンス中は公開サイトの通常コンテンツ、ヘッダー、フッター、AIチャットを利用できません。管理画面と認証画面は引き続き利用できます。",
        propagationNote:
          "保存した設定は、次回のネットワークを伴うアクセスから反映されます。",
        updatedAtLabel: "最終更新",
      },
    },
  },
  en: {
    nav: {
      access: "Access & Facilities",
      language: "Language",
      openMenu: "Open menu",
      closeMenu: "Close menu",
    },
    theme: {
      light: "Light",
      dark: "Dark",
    },
    maintenance: {
      title: "Website Under Maintenance",
      description:
        "This website is currently undergoing scheduled maintenance. Service will be restored shortly.",
    },
    findInfo: {
      title: "Find Information",
      subtitle: "Find information",
      sectionLabel: "Consult Zoom AI",
      call: {
        title: "AI Phone Consultation",
        description:
          "AI handles your inquiry first, then connects you to a live operator for complex matters or questions involving personal information.",
        unavailableAlert:
          "A phone number has not been configured for AI phone consultation.",
      },
    },
    news: {
      title: "News",
      subtitle: "Information",
      more: "See More",
      close: "Close",
      category: { new: "Latest News", featured: "Featured" },
    },
    contentPages: {
      breadcrumbLabel: "Breadcrumb",
      tableOfContents: "On this page",
      home: "Home",
      newsIndexTitle: "News",
      allNews: "All News",
      categoryLead: "Find key information about {name}.",
      topicCardLead: "Learn about {name}, including key procedure details.",
      topicLead: "Learn about {name}, including key points and procedures.",
      topicsHeading: "Topics",
      overviewHeading: "Overview",
      checkHeading: "What to Check",
      checkEligibility: "Eligibility",
      checkDocuments: "Required Documents",
      checkHowToUse: "How to Apply or Use the Service",
      checkEligibilityDescription:
        "Check any conditions stated in the guidance, such as eligible ages, residency requirements, and application periods. Information with no stated conditions is available as presented.",
      checkDocumentsDescription:
        "When an application or reservation is required, check in advance for any proof of identity, items to bring, or other required materials.",
      checkHowToUseDescription:
        "Review the information, then complete any necessary procedure or consultation online, at a service counter, or by phone.",
      newsScopeHeading: "Scope & Impact",
      newsScopeDescription:
        "Check who and which areas the notice applies to, along with any procedures or services it may affect.",
      newsConfirmationHeading: "What to Confirm",
      newsConfirmationDescription:
        "Review the relevant dates, conditions, and precautions described in the notice.",
      newsActionHeading: "Next Steps",
      newsActionDescription:
        "Follow the notice to apply, make a reservation, seek advice, or check for updates as appropriate.",
      contactHeading: "Contact Us",
      contactPhoneLabel: "Phone",
      backToCategory: "Back to this category",
      publishedLabel: "Published",
      readMore: "Read more",
      faq: {
        indexLead:
          "Browse frequently asked questions from Mirai City by department or bureau.",
        departmentsHeading: "Browse by Department or Bureau",
        departmentLead:
          "Browse frequently asked questions about {name} by category.",
        categoriesHeading: "FAQ Categories",
        categoryLead:
          "Find answers to frequently asked questions about {name}.",
        questionsHeading: "Frequently Asked Questions",
        questionCount: "{count} questions",
        backToIndex: "Back to all frequently asked questions",
        backToDepartment: "Back to FAQs for this department or bureau",
      },
    },
    footer: {
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      feedback: "Feedback & Requests",
      sitemap: "Site Map",
      login: "Log in",
      goToAdmin: "Admin",
      phoneLabel: "Phone: ",
      phoneNote: " (Main)",
    },
    docs: {
      viewAsMarkdown: "View as Markdown",
    },
    links: {
      opensInNewTab: "Opens in a new tab",
    },
    auth: {
      loginTitle: "Admin Login",
      loginDescription:
        "Access demo-operator features such as article editing and phone number updates.",
      email: "Email address",
      password: "Password",
      currentPassword: "Current password",
      newPassword: "New password",
      showPassword: "Show password",
      hidePassword: "Hide password",
      name: "Name",
      role: "Role",
      roleUser: "User",
      roleAdmin: "Admin",
      login: "Log in",
      signOut: "Log out",
      forgotPassword: "Request password reset",
      forgotPasswordTitle: "Password Reset Request",
      forgotPasswordDescription:
        "An administrator will review the request and issue a new temporary password.",
      requestReset: "Request reset",
      resetRequestSent:
        "Your request has been received. Please wait for administrator guidance.",
      changePasswordTitle: "Change Password",
      changePasswordDescription:
        "If you logged in with a temporary password, change it before continuing.",
      changePassword: "Change password",
      passwordChanged: "Your password has been changed.",
      temporaryPassword: "Temporary password",
      temporaryPasswordDescription:
        "This temporary password is shown only once. Share it with the user through a secure channel.",
      copyTemporaryPassword: "Copy temporary password",
      temporaryPasswordCopied: "Temporary password copied.",
      temporaryPasswordCopyFailed:
        "Could not copy the temporary password. Select it and copy it manually.",
      required: "Required",
      error: "The request failed.",
    },
    admin: {
      industrySettings: {
        openUniversitySettings: "Open university settings",
        saveError: "Could not save. Your input has been preserved. Please try again.",
        saving: "Saving...",
        pageHelpLabel: "Page description",
        pageHelpDescription: "Edit {title} settings for the selected industry.",
        placeholder: "Select industry",
        "label": "Industry to configure",
        "help": "Choose the industry to edit on this page.",
        "scope": "Save all tabs on this page for {tenant}.",
        "saved": "Settings saved for {tenant}.",
        "dirty": "You have unsaved changes.",
        "loading": "Loading settings for {tenant}.",
        "loadError": "Could not load settings for {tenant}.",
        "retry": "Reload",
        "readonly": "View only. You do not have permission to edit.",
        "invalid": "This industry is not available.",
        "continue": "Continue editing",
        "discard": "Discard changes and switch",
        "confirmTitle": "Discard unsaved changes?",
        "confirmTenant": "Changes for {tenant} have not been saved. Switching to {destination} will discard your changes.",
        "confirmPage": "Changes for {tenant} have not been saved. Opening {destination} will discard your changes.",
        "consultationTitle": "Online consultation management",
        "consultationDescription": "Configure connection web tags for the selected industry’s consultation services.",
        "consultationConnectionLabel": "{service} connection settings",
        "consultationTagDescription": "Configure the connection web tag issued by the online consultation service.",
        "tag": "Connection web tag",
        "tagHelp": "Only supported connection web tags are accepted.",
        "memo": "Admin memo",
        "invalidInput": "Check your input.",
        "names": {
          "lg": "Local government (Future City)",
          "univ": "University (Future University)"
        },
        "services": {
          "general": "General consultation",
          "admissions": "Admissions",
          "student-support": "Student life and scholarships",
          "careers": "Careers"
        }
      },
      title: "Admin",
      pageDescriptionLabel: "About {title}",
      users: "User Management",
      newUser: "Create User",
      createUserAction: "Create",
      passwordResets: "Reset Requests",
      phoneSettings: "Phone Management",
      chatSettings: "AI Chat Management",
      onlineConsultation: "Online Consultation",
      languageSettings: "Languages",
      maintenanceSettings: "Maintenance",
      developerApi: "Developer API",
      reservations: "Reservation system",
      settingsMenu: "Settings",
      navigation: {
        usersSection: "Users",
        settingsSection: "Settings",
        usersSectionNavigation: "User management sections",
        settingsSectionNavigation: "Settings sections",
        backToSite: "Back to public site",
        openMenu: "Open navigation",
        closeMenu: "Close navigation",
        collapseSidebar: "Collapse sidebar",
        expandSidebar: "Expand sidebar",
        accountMenuLabel: "Account actions",
        openAccountMenu: "Open account menu for {name}",
        closeAccountMenu: "Close account menu for {name}",
      },
      reservationManagement: reservationManagementCopy.en,
      zaad: zaadDictionaries.en,
      userListTitle: "User Management",
      searchPlaceholder: "Search by name or email",
      search: "Search",
      clear: "Clear",
      createUserTitle: "Create User",
      createUserDescription:
        "Issue a temporary password and require the user to change it after first login.",
      createUser: "Create user",
      email: "Email",
      name: "Name",
      role: "Role",
      mustChangePassword: "Must change password",
      createdAt: "Created at",
      status: "Status",
      requestedAt: "Requested at",
      reviewedAt: "Reviewed at",
      approve: "Approve",
      reject: "Reject",
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      consumed: "Changed",
      noUsers: "No matching users.",
      noResetRequests: "No password reset requests.",
      page: "Page",
      paginationLabel: "User list pages",
      previous: "Previous",
      next: "Next",
      issuedPasswordTitle: "Temporary Password Issued",
      issuedPasswordDescription:
        "It cannot be shown again after this view closes. Ask the user to log in and change it.",
      adminOnly: "Administrators only.",
      myPage: {
        title: "My page",
        description: "View your signed-in account information.",
        name: "Name",
        email: "Email address",
        noAccess: "No admin features are currently available to you. Contact an administrator if you need access.",
        denied: "You do not have permission to access this page.",
      },
      accessControl: {
        rolesNav: "Roles",
        listTitle: "Roles",
        listDescription:
          "Control administration-page access with each role. An explicit deny overrides an allow.",
        roleCount: "roles",
        addRole: "Add role",
        createTitle: "Add role",
        createDescription:
          "Enter a role name and description. All administration-page permissions start unselected.",
        roleName: "Role name",
        roleNameRequired: "Enter a role name.",
        roleNameTooLong: "Enter a role name with no more than 64 characters.",
        roleDescription: "Description",
        descriptionOptional: "Description (optional)",
        memberCount: "Members",
        actions: "Actions",
        edit: "Edit",
        editRoleTitle: "Edit role",
        editRoleDescription: "Edit the role name and description.",
        systemRole: "System role",
        systemRoleReadOnly: "System roles cannot be changed.",
        noRoles: "No roles.",
        cancel: "Cancel",
        add: "Add",
        saving: "Saving…",
        save: "Save",
        saved: "Role settings saved.",
        reload: "Reload latest information",
        deleteRole: "Delete role",
        backToRoles: "Back to roles",
        backToUserDetails: "Back to user details",
        settingsTab: "Role settings",
        membersTab: "Role members",
        adminPageAccessTitle: "Administration page access",
        adminPageAccessDescription:
          "Clearing View also removes Create, Update, and Delete for that page.",
        adminPageColumn: "Administration page",
        allow: "Allow",
        deny: "Deny",
        unset: "Not set",
        unsupported: "Not available",
        path: "Path",
        targetPaths: "Paths",
        assignedRoles: "Assigned access role",
        noAssignedRoles: "No access role is assigned.",
        effectiveAccess: "Effective access",
        userAccessPageTitle: "User Access | Future City Admin",
        userAccessTitle: "Effective user access",
        userAccessHeading: "{name}’s access",
        userAccessDescription:
          "Final access after applying the assigned role and administrator gate.",
        viewAccess: "Review access",
        allowed: "Allowed",
        denied: "Denied",
        genericError: "Unable to process the role.",
        conflictError: "The role changed elsewhere. Reload and try again.",
        duplicateError: "A role with this name already exists.",
        listSearchPlaceholder: "Search by role name or ID",
        memberSearchPlaceholder: "Search members by name, email, or ID",
        candidateSearchPlaceholder: "Search users to add by name, email, or ID",
        assignUsers: "Add users",
        assign: "Assign",
        removeAssignment: "Remove assignment",
        noMembers: "No users are assigned to this role.",
        noCandidates: "There are no users available to add.",
        candidateDialogTitle: "Add role members",
        candidateDialogDescription:
          "Replace the selected user’s current access role.",
        deleteRoleTitle: "Delete this role?",
        deleteRoleDescription:
          "The role and its permission settings will be permanently deleted. This cannot be undone.",
        roleInUse: "Remove every member assignment before deleting this role.",
        readOnlyRoleAction:
          "You do not have permission to perform this action.",
        adminAttributeHelp:
          "Used as an additional gate for admin-user operations.",
        assignedRolesHelp:
          "Determines view, create, update, and delete access for each administration page. A user has one role.",
        accessRoleSummaryHelp:
          "Determines view, create, update, and delete access for each administration page.",
        replaceAccessRoleHelp:
          "Saving replaces the current access role with the selected role.",
        loading: "Loading…",
        accountSuspended:
          "All access is denied because this user is suspended.",
        passwordChangeRequired:
          "All access is denied until the initial password change is complete.",
        systemRoleNames: { FULL_ACCESS: "Full access", NO_ACCESS: "No access" },
        systemRoleDescriptions: {
          FULL_ACCESS: "Allows every supported administration action.",
          NO_ACCESS:
            "Grants no permissions, so every action is implicitly denied.",
        },
        resourceTitles: {
          users: "Admin users",
          "password-reset-requests": "Password reset requests",
          roles: "Role management",
          "role-assignments": "Role members",
          "phone-settings": "Phone settings",
          "chat-settings": "AI chat settings",
          "language-settings": "Language settings",
          "maintenance-settings": "Maintenance settings",
          "developer-api": "Developer API",
          reservations: "Reservation system",
          zaad: "AutoReach",
        },
        resourceDescriptions: {
          users:
            "Lists and manages admin users, passwords, status, and access summaries.",
          "password-reset-requests": "Views, approves, and rejects requests.",
          roles: "Manages access roles, descriptions, and permissions.",
          "role-assignments":
            "Views and replaces each user’s single access role.",
          "phone-settings": "Manages representative and AI phone numbers.",
          "chat-settings": "Manages Web Chat mode and connection settings.",
          "language-settings": "Manages public-site languages and order.",
          "maintenance-settings": "Manages environment modes and schedules.",
          "developer-api":
            "Manages API and webhook credentials for integrations.",
          reservations:
            "Views municipal availability and generates demo bookings.",
          zaad: "Manages disaster radio residents, outbound messages, contact lists, and campaigns.",
        },
        actionLabels: {
          VIEW: "View",
          CREATE: "Create",
          UPDATE: "Edit",
          DELETE: "Delete",
        },
      },
      userManagement: {
        detailsPageTitle: "User Details | Future City Admin",
        detailsTitle: "User details",
        detailsDescription:
          "Manage user information, privilege, access role, and password.",
        detailsReadOnly:
          "You can view this user. Changes require permission to edit users.",
        name: "Name",
        accessRoles: "Access role",
        backToUsers: "Back to User Management",
        settings: "Settings",
        actionsFor: "Settings for",
        edit: "Edit",
        suspend: "Suspend",
        reactivate: "Reactivate",
        delete: "Delete",
        active: "Active",
        suspended: "Suspended",
        save: "Save",
        saving: "Saving…",
        cancel: "Cancel",
        saved: "Changes saved.",
        password: "Password",
        resetPassword: "Reset",
        passwordConfigured: "Configured",
        passwordChangeRequired: "Change required after next sign-in",
        passwordVisibilityHelp: "Passwords cannot be shown to another user.",
        selfPasswordResetProtected:
          "Change your own password from the Change Password page.",
        passwordMode: "Password type",
        temporaryPasswordMode: "Temporary password",
        temporaryPasswordModeDescription:
          "Require the user to change it after their next sign-in.",
        standardPasswordMode: "Standard password",
        standardPasswordModeDescription:
          "Allow the user to continue using the password set by the administrator.",
        newPassword: "New password",
        confirmPassword: "Confirm new password",
        passwordsMatch: "The passwords match.",
        passwordRequirements: "Enter between 12 and 128 characters.",
        generateTemporaryPassword: "Generate a temporary password",
        revokeSessions: "Force sign-out after changing",
        revokeSessionsDescription:
          "When enabled, all active sessions for this user will end.",
        enabled: "Yes",
        disabled: "No",
        passwordDialogTitle: "Reset this password?",
        passwordDialogDescription:
          "Review the settings before resetting the password. The previous password will no longer work.",
        confirmPasswordReset: "Reset password",
        passwordResetSaved: "Password reset successfully.",
        selfProtected: "You cannot perform this action on your own account.",
        lastAdminProtected:
          "You cannot perform this action on the last active administrator.",
        emailDialogTitle: "Change this email address?",
        emailDialogDescription:
          "The new email address will be used to log in. Review it before confirming the change.",
        currentEmail: "Current email address",
        newEmail: "New email address",
        changeEmail: "Change email address",
        suspendDialogTitle: "Suspend this user?",
        suspendDialogDescription:
          "The user’s active sessions will end, and they will be unable to log in until reactivated.",
        reactivateDialogTitle: "Reactivate this user?",
        reactivateDialogDescription:
          "Remove the suspension and allow this user to log in again.",
        deleteDialogTitle: "Delete this user?",
        deleteDialogDescription:
          "The user and authentication information will be permanently deleted. This cannot be undone.",
        targetUser: "Target user",
        errors: {
          AUTHENTICATION_REQUIRED: "Please sign in.",
          ADMINISTRATOR_REQUIRED: "Administrator access is required.",
          PASSWORD_CHANGE_REQUIRED: "Change your password first.",
          INVALID_REQUEST: "The request is invalid.",
          INVALID_NAME: "Enter a name.",
          INVALID_EMAIL: "Enter a valid email address.",
          EMAIL_ALREADY_EXISTS: "This email address is already in use.",
          INVALID_ROLE: "Select a valid role.",
          INVALID_PASSWORD: "Enter a password between 12 and 128 characters.",
          PASSWORD_MISMATCH: "The confirmation password does not match.",
          USER_NOT_FOUND: "The user could not be found.",
          SELF_PROTECTED: "You cannot perform this action on your own account.",
          LAST_ACTIVE_ADMIN:
            "You cannot perform this action on the last active administrator.",
          UPDATE_FAILED: "Unable to update the user.",
          SUSPEND_FAILED: "Unable to suspend the user.",
          REACTIVATE_FAILED: "Unable to reactivate the user.",
          DELETE_FAILED: "Unable to delete the user.",
          RESET_PASSWORD_FAILED: "Unable to reset the password.",
          SESSION_REVOCATION_FAILED:
            "The password changed, but active sessions could not be ended.",
        },
      },
      settings: {
        save: "Save settings",
        saving: "Saving…",
        saved: "Settings saved.",
        saveError: "Unable to save settings.",
        pageSaveScope: "Saves settings from all tabs on this page.",
        sectionSaveScope: "Saves settings in this section.",
        errors: {
          AUTHENTICATION_REQUIRED: "Please sign in.",
          ADMINISTRATOR_REQUIRED: "Administrator access is required.",
          PASSWORD_CHANGE_REQUIRED:
            "Change your password before updating settings.",
          INVALID_REQUEST: "Please review the entered values.",
          INVALID_REPRESENTATIVE_PHONE_DISPLAY:
            "The representative phone display contains unsupported characters.",
          INVALID_REPRESENTATIVE_PHONE_E164:
            "Enter the representative dialing number in E.164 format.",
          INVALID_AI_PHONE_E164: "Enter each AI phone number in E.164 format.",
          INVALID_ZOOM_CAMPAIGN_WEB_TAG:
            "Enter a valid Web Tag issued from Zoom Campaign settings in the Campaign field.",
          INVALID_ZOOM_CONTACT_CENTER_WEB_TAG:
            "Enter a valid Web Tag containing data-chat-entry-id in the Contact Center Entry ID field.",
          ACTIVE_ZOOM_CHAT_TAG_REQUIRED:
            "Enter a Web Tag for the selected chat method.",
          INVALID_CHAT_MEMO:
            "Each administration memo must be 4,000 characters or fewer.",
          INVALID_LANGUAGE_SETTINGS:
            "Include each of the five languages exactly once.",
          JAPANESE_REQUIRED: "Japanese cannot be disabled.",
          SETTINGS_SAVE_FAILED: "Unable to save settings.",
        },
      },
      phoneManagement: {
        title: "Phone Management",
        description:
          "Configure the representative phone and the AI consultation number used for each site language.",
        representativeTitle: "Representative Phone",
        representativeDescription:
          "Configure the number shown in the shared footer and the number used for dialing.",
        representativeDisplayLabel: "Display phone number",
        representativeDisplayHelp: "Example: (03)1234-5678",
        representativeE164Label: "Dialing number (E.164)",
        representativeE164Help: "Example: +81312345678",
        aiPhoneTitle: "AI Phone Consultation",
        aiPhoneDescription:
          "Set the phone number dialed for each selected site language. A blank value is saved as not configured.",
        aiPhoneLabel: "AI phone number (E.164)",
        hidden: "Hidden",
      },
      developerApiManagement: {
        title: "Developer API",
        description:
          "Configure credentials and the Webhook Secret Token used by external integrations.",
        oauthTitle: "Server To Server OAuth",
        oauthDescription:
          "Configure credentials used to connect to the Zoom API.",
        webhookTitle: "Webhook Only app",
        webhookDescription:
          "Configure the Secret Token used to verify webhooks.",
        accountId: "Account ID",
        clientId: "Client ID",
        clientSecret: "Client Secret",
        secretToken: "Secret Token",
        errors: {
          DEVELOPER_API_INVALID_REQUEST: "Review the entered values.",
          DEVELOPER_API_INVALID_ACCOUNT_ID:
            "Enter an Account ID from 1 to 255 characters.",
          DEVELOPER_API_INVALID_CLIENT_ID:
            "Enter a Client ID from 1 to 255 characters.",
          DEVELOPER_API_OAUTH_SECRET_REQUIRED:
            "Client Secret is required for the initial Server-To-Server OAuth save.",
          DEVELOPER_API_WEBHOOK_SECRET_REQUIRED:
            "Secret Token is required for the initial Webhook only app save.",
          DEVELOPER_API_ENCRYPTION_UNAVAILABLE:
            "Unable to save because encryption is unavailable.",
          DEVELOPER_API_SECRET_NOT_CONFIGURED:
            "No configured secret is available to reveal.",
          DEVELOPER_API_SECRET_REVEAL_FAILED: "Unable to reveal the secret.",
          DEVELOPER_API_SAVE_FAILED: "Unable to save Developer API settings.",
        },
      },
      chatManagement: {
        title: "AI Chat Management",
        description:
          "Choose the Zoom chat method used on the public site and configure both Web Tags. Settings for the inactive method are also retained.",
        methodTab: "Method",
        campaignTab: "Campaign",
        activeModeTitle: "Method used on the public site",
        activeModeDescription:
          "Select one method. Switching methods does not erase the saved Campaign or Entry ID values.",
        active: "Active",
        inactive: "Not active",
        modes: {
          disabled: {
            label: "Do not use",
            description:
              "Do not load the Zoom chat SDK on the public site. Saved tags are retained.",
          },
          campaign: {
            label: "Campaign",
            description:
              "Display chat according to the target URLs and delivery rules configured in Zoom Campaigns.",
          },
          contactCenterEntryId: {
            label: "Contact Center Entry ID",
            description:
              "Start chat with the Entry ID for a specific Contact Center flow.",
          },
        },
        campaign: {
          title: "Campaign",
          description:
            "Paste the tag copied from Contact Center Management > Campaigns > Embed Web Tag in the Zoom admin portal.",
          webTagLabel: "Campaign Web Tag (Embed Web Tag)",
          webTagHelp:
            "Paste the complete script tag. Tags containing data-chat-entry-id are not valid in this field.",
          memoLabel: "Campaign memo (optional)",
          memoHelp:
            "Internal memo for administrators. It is not displayed or used on the public site (maximum 4,000 characters).",
        },
        contactCenterEntryId: {
          title: "Contact Center Entry ID",
          description:
            "Paste the tag copied from Start > Manage Entry Point > Import SDK for the target flow.",
          webTagLabel: "Contact Center Web Tag (Import SDK)",
          webTagHelp:
            "Paste the complete script tag. The tag in this field must contain data-chat-entry-id.",
          memoLabel: "Contact Center memo (optional)",
          memoHelp:
            "Internal memo for administrators. It is not displayed or used on the public site (maximum 4,000 characters).",
        },
      },
      languageManagement: {
        title: "Language Management",
        description:
          "Choose which languages appear in the public language menu and arrange their order.",
        enabledCountLabel: "Displayed languages",
        japaneseRequired: "Required",
        moveUp: "Move up",
        moveDown: "Move down",
      },
      maintenanceManagement: {
        title: "Maintenance Management",
        description:
          "Choose whether the public site is available normally, enters maintenance immediately, or follows a schedule.",
        environmentLabel: "Target environment",
        environments: {
          production: "Production",
          preview: "Preview",
          development: "Development",
        },
        effectiveStateTitle: "Current effective state",
        effectiveActive: "Under maintenance",
        effectiveInactive: "Available normally",
        effectiveUnknown: "Unable to determine",
        currentValueUnavailableTitle: "Current settings are unavailable",
        currentValueUnavailableDescription:
          "Inputs and saving are disabled to prevent an unintended availability change. Reload this page later.",
        modeTitle: "Publication mode",
        modeDescription: "Select one mode to apply to the public site.",
        modes: {
          disabled: {
            label: "Normal availability",
            description: "Show the regular public-site content.",
          },
          enabled: {
            label: "Start maintenance now",
            description:
              "Switch the public site to the maintenance page after saving.",
          },
          scheduled: {
            label: "Scheduled maintenance",
            description:
              "Show the maintenance page between the specified start and end times.",
          },
        },
        scheduleTitle: "Schedule",
        scheduleDescription:
          "Used when scheduled maintenance is selected. Saved times are retained when you switch to another mode.",
        scheduledStartLabel: "Start date and time (JST)",
        scheduledEndLabel: "End date and time (JST)",
        timeZoneNote: "Enter dates and times in Japan Standard Time (JST).",
        scheduleRequired: "Enter both a start and an end date and time.",
        scheduleOrderError: "The end date and time must be after the start.",
        scheduleEndFutureError: "The end date and time must be in the future.",
        conflictError:
          "Another administrator updated these settings. Your entries have been kept. Reload the page to review the latest settings, then save again.",
        warningTitle: "The public-site display will change",
        warningDescription:
          "During maintenance, regular public content, the header, footer, and AI chat are unavailable. Admin and authentication pages remain available.",
        propagationNote:
          "Saved settings take effect on the next network request.",
        updatedAtLabel: "Last updated",
      },
    },
  },
  "zh-Hans": {
    nav: {
      access: "交通・设施指南",
      language: "语言",
      openMenu: "打开菜单",
      closeMenu: "关闭菜单",
    },
    theme: {
      light: "浅色",
      dark: "深色",
    },
    maintenance: {
      title: "网站维护中",
      description: "本网站目前正在进行计划维护，将很快恢复服务。",
    },
    findInfo: {
      title: "查找信息",
      subtitle: "Find information",
      sectionLabel: "咨询 Zoom AI",
      call: {
        title: "AI 电话咨询",
        description:
          "由 AI 进行首次应答，高级咨询或涉及个人信息的咨询将转接至人工坐席。",
        unavailableAlert: "尚未设置 AI 电话咨询的电话号码。",
      },
    },
    news: {
      title: "通知公告",
      subtitle: "Information",
      more: "查看更多",
      close: "收起",
      category: { new: "最新消息", featured: "重点关注" },
    },
    contentPages: {
      breadcrumbLabel: "面包屑导航",
      tableOfContents: "本页目录",
      home: "首页",
      newsIndexTitle: "通知公告",
      allNews: "查看所有通知公告",
      categoryLead:
        "本页汇总与“{name}”有关的主要办事和服务。请选择您想了解的项目。",
      topicCardLead: "查看“{name}”的概要和办理要点。",
      topicLead: "本页介绍“{name}”的概要、需要确认的事项和使用方法。",
      topicsHeading: "主要办事与服务",
      overviewHeading: "概要",
      checkHeading: "请先确认",
      checkEligibility: "适用对象",
      checkDocuments: "所需材料",
      checkHowToUse: "办理或使用方法",
      checkEligibilityDescription:
        "请确认各项指南中列明的适用年龄、居住条件和受理期间等条件。未列明条件的信息可直接使用。",
      checkDocumentsDescription:
        "如需申请或预约，请事先确认本人身份证明、当天需携带的物品等必要材料。",
      checkHowToUseDescription:
        "请确认页面内容，并根据需要通过在线、办事窗口或电话办理手续或进行咨询。",
      newsScopeHeading: "适用对象与影响范围",
      newsScopeDescription:
        "请确认本通知适用的人员和地区，以及可能受影响的手续或服务。",
      newsConfirmationHeading: "确认事项",
      newsConfirmationDescription:
        "请根据通知内容确认实施时间、条件和注意事项等必要信息。",
      newsActionHeading: "下一步",
      newsActionDescription:
        "请按照通知内容进行申请、预约、咨询或确认后续更新。",
      contactHeading: "咨询方式",
      contactPhoneLabel: "电话",
      backToCategory: "返回分类页面",
      publishedLabel: "发布日期",
      readMore: "查看详情",
      faq: {
        indexLead: "按部门和局分类查看未来市的常见问题。",
        departmentsHeading: "按部门或局查找",
        departmentLead: "按类别查看有关{name}的常见问题。",
        categoriesHeading: "常见问题类别",
        categoryLead: "查看有关{name}的常见问题及解答。",
        questionsHeading: "常见问题",
        questionCount: "共{count}个问题",
        backToIndex: "返回常见问题一览",
        backToDepartment: "返回本部门或局的常见问题一览",
      },
    },
    footer: {
      terms: "使用条款",
      privacy: "隐私政策",
      feedback: "意见・要望",
      sitemap: "网站地图",
      login: "登录",
      goToAdmin: "管理页面",
      phoneLabel: "电话号码：",
      phoneNote: "（总机）",
    },
    docs: {
      viewAsMarkdown: "查看 Markdown 版本",
    },
    links: {
      opensInNewTab: "在新标签页中打开",
    },
    auth: {
      loginTitle: "管理登录",
      loginDescription:
        "访问面向演示运营者的文章编辑、电话号码变更等管理功能。",
      email: "电子邮件地址",
      password: "密码",
      currentPassword: "当前密码",
      newPassword: "新密码",
      showPassword: "显示密码",
      hidePassword: "隐藏密码",
      name: "姓名",
      role: "权限",
      roleUser: "普通用户",
      roleAdmin: "管理员",
      login: "登录",
      signOut: "退出登录",
      forgotPassword: "申请重置密码",
      forgotPasswordTitle: "密码重置申请",
      forgotPasswordDescription: "管理员将确认申请并发放新的临时密码。",
      requestReset: "申请重置",
      resetRequestSent: "已受理申请。请等待管理员通知。",
      changePasswordTitle: "更改密码",
      changePasswordDescription: "使用临时密码登录后，请先更改为新密码。",
      changePassword: "更改密码",
      passwordChanged: "密码已更改。",
      temporaryPassword: "临时密码",
      temporaryPasswordDescription:
        "临时密码只会显示一次。请通过安全方式共享给目标用户。",
      copyTemporaryPassword: "复制临时密码",
      temporaryPasswordCopied: "已复制临时密码。",
      temporaryPasswordCopyFailed: "无法复制。请选择临时密码并手动复制。",
      required: "必填",
      error: "处理失败。",
    },
    admin: {
      industrySettings: {
        openUniversitySettings: "打开大学设置",
        saveError: "无法保存。已保留输入内容，请重试。",
        saving: "正在保存...",
        pageHelpLabel: "页面说明",
        pageHelpDescription: "编辑所选行业的{title}设置。",
        placeholder: "选择行业",
        "label": "设置对象行业",
        "help": "选择要在此页面编辑的行业。",
        "scope": "保存{tenant}在此页面所有选项卡中的设置。",
        "saved": "已保存{tenant}的设置。",
        "dirty": "有未保存的更改。",
        "loading": "正在加载{tenant}的设置。",
        "loadError": "无法加载{tenant}的设置。",
        "retry": "重新加载",
        "readonly": "仅可查看。您没有编辑权限。",
        "invalid": "该行业不可用。",
        "continue": "继续编辑",
        "discard": "放弃更改并切换",
        "confirmTitle": "放弃未保存的更改？",
        "confirmTenant": "{tenant}的更改尚未保存。切换到{destination}将丢弃输入的更改。",
        "confirmPage": "{tenant}的更改尚未保存。打开{destination}将丢弃输入的更改。",
        "consultationTitle": "在线咨询管理",
        "consultationDescription": "为所选行业的在线咨询窗口设置连接网页标签。",
        "consultationConnectionLabel": "{service}连接设置",
        "consultationTagDescription": "设置在线咨询服务提供的连接网页标签。",
        "tag": "连接网页标签",
        "tagHelp": "仅接受符合规范的连接网页标签。",
        "memo": "管理备注",
        "invalidInput": "请检查输入内容。",
        "names": {
          "lg": "地方政府（未来市）",
          "univ": "大学（未来大学）"
        },
        "services": {
          "general": "综合咨询",
          "admissions": "入学与招生",
          "student-support": "学生生活与奖学金",
          "careers": "就业指导"
        }
      },
      title: "管理页面",
      pageDescriptionLabel: "关于{title}",
      users: "用户管理",
      newUser: "创建用户",
      createUserAction: "创建",
      passwordResets: "重置申请",
      phoneSettings: "电话管理",
      chatSettings: "AI聊天管理",
      onlineConsultation: "在线咨询",
      languageSettings: "语言管理",
      maintenanceSettings: "维护管理",
      developerApi: "Developer API",
      reservations: "预约系统",
      settingsMenu: "设置",
      navigation: {
        usersSection: "用户",
        settingsSection: "设置",
        usersSectionNavigation: "用户管理分区",
        settingsSectionNavigation: "设置管理分区",
        backToSite: "返回公开网站",
        openMenu: "打开导航",
        closeMenu: "关闭导航",
        collapseSidebar: "收起侧边导航",
        expandSidebar: "展开侧边导航",
        accountMenuLabel: "帐户操作",
        openAccountMenu: "打开{name}的帐户菜单",
        closeAccountMenu: "关闭{name}的帐户菜单",
      },
      reservationManagement: reservationManagementCopy["zh-Hans"],
      zaad: zaadDictionaries["zh-Hans"],
      userListTitle: "用户管理",
      searchPlaceholder: "按姓名或电子邮件搜索",
      search: "搜索",
      clear: "清除",
      createUserTitle: "管理员创建用户",
      createUserDescription: "发放首次登录用临时密码，并要求首次登录后更改。",
      createUser: "创建用户",
      email: "电子邮件地址",
      name: "姓名",
      role: "权限",
      mustChangePassword: "需要更改密码",
      createdAt: "创建时间",
      status: "状态",
      requestedAt: "申请时间",
      reviewedAt: "确认时间",
      approve: "批准",
      reject: "拒绝",
      pending: "待处理",
      approved: "已批准",
      rejected: "已拒绝",
      consumed: "已更改",
      noUsers: "没有符合条件的用户。",
      noResetRequests: "没有密码重置申请。",
      page: "页面",
      paginationLabel: "用户列表分页",
      previous: "上一页",
      next: "下一页",
      issuedPasswordTitle: "已发放临时密码",
      issuedPasswordDescription:
        "关闭此画面后无法再次显示。共享后请用户登录并更改密码。",
      adminOnly: "仅限管理员访问。",
      myPage: {
        title: "我的页面",
        description: "查看当前登录的账户信息。",
        name: "姓名",
        email: "电子邮件地址",
        noAccess: "您目前没有可用的管理功能。如需使用，请联系管理员。",
        denied: "您没有访问此页面的权限。",
      },
      accessControl: {
        rolesNav: "角色",
        listTitle: "角色",
        listDescription: "通过各个角色控制管理页面访问。明确拒绝优先于允许。",
        roleCount: "个角色",
        addRole: "添加角色",
        createTitle: "添加角色",
        createDescription:
          "输入角色名称和说明。创建时所有管理页面权限均为未选择状态。",
        roleName: "角色名称",
        roleNameRequired: "请输入角色名称。",
        roleNameTooLong: "角色名称不能超过64个字符。",
        roleDescription: "说明",
        descriptionOptional: "说明（可选）",
        memberCount: "成员数",
        actions: "操作",
        edit: "编辑",
        editRoleTitle: "编辑角色",
        editRoleDescription: "编辑角色名称和说明。",
        systemRole: "系统角色",
        systemRoleReadOnly: "系统角色无法更改。",
        noRoles: "没有角色。",
        cancel: "取消",
        add: "添加",
        saving: "保存中…",
        save: "保存",
        saved: "角色设置已保存。",
        reload: "重新加载最新信息",
        deleteRole: "删除角色",
        backToRoles: "返回角色列表",
        backToUserDetails: "返回用户详情",
        settingsTab: "角色设置",
        membersTab: "角色成员",
        adminPageAccessTitle: "管理页面访问权限",
        adminPageAccessDescription:
          "取消“查看”后，同一页面的创建、编辑和删除也将不被允许。",
        adminPageColumn: "管理页面",
        allow: "允许",
        deny: "拒绝",
        unset: "未设置",
        unsupported: "不适用",
        path: "路径",
        targetPaths: "目标路径",
        assignedRoles: "已分配角色",
        noAssignedRoles: "未分配角色。",
        effectiveAccess: "有效访问权限",
        userAccessPageTitle: "用户访问权限 | 未来市管理页面",
        userAccessTitle: "用户有效访问权限",
        userAccessHeading: "{name}的访问权限",
        userAccessDescription:
          "这是应用所分配角色和管理员附加条件后的最终结果。",
        viewAccess: "查看访问权限",
        allowed: "允许",
        denied: "拒绝",
        genericError: "无法处理角色。",
        conflictError: "角色已在其他位置更改，请重新加载。",
        duplicateError: "已存在同名角色。",
        listSearchPlaceholder: "按角色名称或 ID 搜索",
        memberSearchPlaceholder: "按姓名、电子邮件或 ID 搜索成员",
        candidateSearchPlaceholder: "按姓名、电子邮件或 ID 搜索可添加用户",
        assignUsers: "添加用户",
        assign: "分配",
        removeAssignment: "移除分配",
        noMembers: "没有用户被分配到此角色。",
        noCandidates: "没有可添加的用户。",
        candidateDialogTitle: "添加角色成员",
        candidateDialogDescription: "替换所选用户的当前访问角色。",
        deleteRoleTitle: "要删除此角色吗？",
        deleteRoleDescription: "角色及其权限设置将被永久删除，此操作无法撤销。",
        roleInUse: "删除此角色前，请移除所有成员分配。",
        readOnlyRoleAction: "您没有执行此操作的权限。",
        adminAttributeHelp: "用作管理用户操作的附加条件。",
        assignedRolesHelp:
          "决定每个管理页面的查看、创建、编辑和删除权限。每个用户只能拥有一个角色。",
        accessRoleSummaryHelp: "决定每个管理页面的查看、创建、编辑和删除权限。",
        replaceAccessRoleHelp: "保存后，当前访问角色将替换为所选角色。",
        loading: "正在加载…",
        accountSuspended: "由于该用户已停用，所有访问均被拒绝。",
        passwordChangeRequired: "完成首次密码更改之前，所有访问均被拒绝。",
        systemRoleNames: {
          FULL_ACCESS: "完全访问权限",
          NO_ACCESS: "无访问权限",
        },
        systemRoleDescriptions: {
          FULL_ACCESS: "允许所有受支持的管理操作。",
          NO_ACCESS: "不授予任何权限，因此所有操作都会被隐式拒绝。",
        },
        resourceTitles: {
          users: "管理用户",
          "password-reset-requests": "密码重置申请",
          roles: "角色管理",
          "role-assignments": "角色成员",
          "phone-settings": "电话设置",
          "chat-settings": "AI聊天设置",
          "language-settings": "语言设置",
          "maintenance-settings": "维护设置",
          "developer-api": "Developer API",
          reservations: "预约系统",
          zaad: "AutoReach",
        },
        resourceDescriptions: {
          users: "管理用户列表、详情、创建、权限、状态、密码和访问摘要。",
          "password-reset-requests": "查看、批准和拒绝申请。",
          roles: "管理访问角色、说明和权限。",
          "role-assignments": "查看和更改每个用户的单一访问角色。",
          "phone-settings": "管理代表电话号码和AI电话号码。",
          "chat-settings": "管理Web Chat模式和连接设置。",
          "language-settings": "管理公共网站语言和显示顺序。",
          "maintenance-settings": "管理各环境的模式和计划。",
          "developer-api": "管理外部集成使用的 API 和 Webhook 凭据。",
          reservations: "查看市政服务预约情况并生成演示预约。",
          zaad: "管理防灾行政无线居民、外呼消息、联系人列表和活动。",
        },
        actionLabels: {
          VIEW: "查看",
          CREATE: "添加",
          UPDATE: "编辑",
          DELETE: "删除",
        },
      },
      userManagement: {
        detailsPageTitle: "用户详情 | 未来市管理页面",
        detailsTitle: "用户详情",
        detailsDescription: "管理用户信息、权限、访问角色和密码。",
        detailsReadOnly: "您可以查看此用户。更改用户信息需要用户编辑权限。",
        name: "姓名",
        accessRoles: "访问角色",
        backToUsers: "返回用户管理",
        settings: "设置",
        actionsFor: "设置对象",
        edit: "编辑",
        suspend: "停用",
        reactivate: "重新启用",
        delete: "删除",
        active: "有效",
        suspended: "已停用",
        save: "保存",
        saving: "正在保存…",
        cancel: "取消",
        saved: "更改已保存。",
        password: "密码",
        resetPassword: "重置",
        passwordConfigured: "已设置",
        passwordChangeRequired: "下次登录后需要更改",
        passwordVisibilityHelp: "无法显示其他用户的密码。",
        selfPasswordResetProtected: "请从更改密码页面修改自己的密码。",
        passwordMode: "密码类型",
        temporaryPasswordMode: "临时密码",
        temporaryPasswordModeDescription: "要求用户在下次登录后自行更改密码。",
        standardPasswordMode: "普通密码",
        standardPasswordModeDescription: "用户可以继续使用管理员设置的密码。",
        newPassword: "新密码",
        confirmPassword: "确认新密码",
        passwordsMatch: "两次输入的密码一致。",
        passwordRequirements: "请输入12至128个字符。",
        generateTemporaryPassword: "自动生成临时密码",
        revokeSessions: "更改后强制退出登录",
        revokeSessionsDescription: "启用后将结束此用户的所有现有会话。",
        enabled: "是",
        disabled: "否",
        passwordDialogTitle: "要重置密码吗？",
        passwordDialogDescription:
          "请确认设置后再重置密码。重置后旧密码将无法继续使用。",
        confirmPasswordReset: "重置密码",
        passwordResetSaved: "密码已重置。",
        selfProtected: "无法对自己的账户执行此操作。",
        lastAdminProtected: "无法对最后一名有效管理员执行此操作。",
        emailDialogTitle: "要更改电子邮件地址吗？",
        emailDialogDescription: "更改后将使用新地址登录。请确认内容后再更改。",
        currentEmail: "当前电子邮件地址",
        newEmail: "新电子邮件地址",
        changeEmail: "更改电子邮件地址",
        suspendDialogTitle: "要停用此用户吗？",
        suspendDialogDescription:
          "用户的现有会话将结束，重新启用前将无法登录。",
        reactivateDialogTitle: "要重新启用此用户吗？",
        reactivateDialogDescription: "解除停用状态，允许此用户再次登录。",
        deleteDialogTitle: "要删除此用户吗？",
        deleteDialogDescription:
          "用户及其身份验证信息将被永久删除。此操作无法撤销。",
        targetUser: "目标用户",
        errors: {
          AUTHENTICATION_REQUIRED: "请先登录。",
          ADMINISTRATOR_REQUIRED: "需要管理员权限。",
          PASSWORD_CHANGE_REQUIRED: "请先更改密码。",
          INVALID_REQUEST: "请求内容无效。",
          INVALID_NAME: "请输入姓名。",
          INVALID_EMAIL: "请输入有效的电子邮件地址。",
          EMAIL_ALREADY_EXISTS: "此电子邮件地址已被使用。",
          INVALID_ROLE: "请选择有效的权限。",
          INVALID_PASSWORD: "请输入12至128个字符的密码。",
          PASSWORD_MISMATCH: "两次输入的密码不一致。",
          USER_NOT_FOUND: "找不到目标用户。",
          SELF_PROTECTED: "无法对自己的账户执行此操作。",
          LAST_ACTIVE_ADMIN: "无法对最后一名有效管理员执行此操作。",
          UPDATE_FAILED: "无法更新用户信息。",
          SUSPEND_FAILED: "无法停用用户。",
          REACTIVATE_FAILED: "无法重新启用用户。",
          DELETE_FAILED: "无法删除用户。",
          RESET_PASSWORD_FAILED: "无法重置密码。",
          SESSION_REVOCATION_FAILED: "密码已更改，但无法结束现有会话。",
        },
      },
      settings: {
        save: "保存设置",
        saving: "正在保存…",
        saved: "设置已保存。",
        saveError: "无法保存设置。",
        pageSaveScope: "保存此页面所有选项卡的设置。",
        sectionSaveScope: "保存此部分的设置。",
        errors: {
          AUTHENTICATION_REQUIRED: "请先登录。",
          ADMINISTRATOR_REQUIRED: "需要管理员权限。",
          PASSWORD_CHANGE_REQUIRED: "请先更改密码，再更新设置。",
          INVALID_REQUEST: "请检查输入内容。",
          INVALID_REPRESENTATIVE_PHONE_DISPLAY:
            "代表电话号码的显示值包含不支持的字符。",
          INVALID_REPRESENTATIVE_PHONE_E164:
            "请以E.164格式输入代表电话的拨号号码。",
          INVALID_AI_PHONE_E164: "请以E.164格式输入AI电话号码。",
          INVALID_ZOOM_CAMPAIGN_WEB_TAG:
            "请在Campaign字段中输入由Zoom Campaign设置签发的有效Web Tag。",
          INVALID_ZOOM_CONTACT_CENTER_WEB_TAG:
            "请在Contact Center Entry ID字段中输入包含data-chat-entry-id的有效Web Tag。",
          ACTIVE_ZOOM_CHAT_TAG_REQUIRED: "请输入所选聊天方式的Web Tag。",
          INVALID_CHAT_MEMO: "管理备注不能超过4,000个字符。",
          INVALID_LANGUAGE_SETTINGS: "请将5种语言各指定一次且不要重复。",
          JAPANESE_REQUIRED: "不能停用日语。",
          SETTINGS_SAVE_FAILED: "无法保存设置。",
        },
      },
      phoneManagement: {
        title: "电话管理",
        description: "设置代表电话以及公开网站各语言使用的AI电话咨询号码。",
        representativeTitle: "代表电话",
        representativeDescription:
          "设置在共用页脚中显示的电话号码以及拨号时使用的号码。",
        representativeDisplayLabel: "显示用电话号码",
        representativeDisplayHelp: "示例：(03)1234-5678",
        representativeE164Label: "拨号电话号码（E.164）",
        representativeE164Help: "示例：+81312345678",
        aiPhoneTitle: "AI 电话咨询",
        aiPhoneDescription:
          "按公开网站当前选择的语言设置拨打号码。留空时保存为未设置。",
        aiPhoneLabel: "AI电话号码（E.164）",
        hidden: "已隐藏",
      },
      developerApiManagement: {
        title: "Developer API",
        description: "设置外部集成使用的凭据和 Webhook Secret Token。",
        oauthTitle: "Server To Server OAuth",
        oauthDescription: "设置连接 Zoom API 时使用的凭据。",
        webhookTitle: "Webhook Only app",
        webhookDescription: "设置验证 Webhook 时使用的 Secret Token。",
        accountId: "Account ID",
        clientId: "Client ID",
        clientSecret: "Client Secret",
        secretToken: "Secret Token",
        errors: {
          DEVELOPER_API_INVALID_REQUEST: "请检查输入内容。",
          DEVELOPER_API_INVALID_ACCOUNT_ID:
            "Account ID 请输入 1 至 255 个字符。",
          DEVELOPER_API_INVALID_CLIENT_ID: "Client ID 请输入 1 至 255 个字符。",
          DEVELOPER_API_OAUTH_SECRET_REQUIRED:
            "首次保存 Server-To-Server OAuth 时需要 Client Secret。",
          DEVELOPER_API_WEBHOOK_SECRET_REQUIRED:
            "首次保存 Webhook only app 时需要 Secret Token。",
          DEVELOPER_API_ENCRYPTION_UNAVAILABLE: "加密设置不可用，无法保存。",
          DEVELOPER_API_SECRET_NOT_CONFIGURED: "没有可显示的已设置 Secret。",
          DEVELOPER_API_SECRET_REVEAL_FAILED: "无法显示 Secret。",
          DEVELOPER_API_SAVE_FAILED: "无法保存 Developer API 设置。",
        },
      },
      chatManagement: {
        title: "AI聊天管理",
        description:
          "设置公开网站使用的Zoom聊天方式以及两种方式各自的Web Tag。未选中方式的设置也会保留。",
        methodTab: "使用方式",
        campaignTab: "活动",
        activeModeTitle: "公开网站使用的方式",
        activeModeDescription:
          "请选择一种方式。切换方式不会清除已保存的Campaign或Entry ID内容。",
        active: "使用中",
        inactive: "未使用",
        modes: {
          disabled: {
            label: "不使用",
            description: "公开网站不加载Zoom聊天SDK。已保存的标签会继续保留。",
          },
          campaign: {
            label: "Campaign",
            description: "按照Zoom Campaign中设置的目标URL和投放条件显示聊天。",
          },
          contactCenterEntryId: {
            label: "Contact Center Entry ID",
            description: "使用指定Contact Center流程的Entry ID启动聊天。",
          },
        },
        campaign: {
          title: "Campaign",
          description:
            "请粘贴从Zoom管理页面的“Contact Center Management > Campaigns > Embed Web Tag”复制的标签。",
          webTagLabel: "Campaign Web Tag（Embed Web Tag）",
          webTagHelp:
            "请粘贴完整的script标签。此字段不能使用包含data-chat-entry-id的标签。",
          memoLabel: "Campaign备注（可选）",
          memoHelp:
            "供管理员使用的内部备注，不会在公开网站上显示或用于其运行（最多4,000个字符）。",
        },
        contactCenterEntryId: {
          title: "Contact Center Entry ID",
          description:
            "请粘贴从目标流程的“Start > Manage Entry Point > Import SDK”复制的标签。",
          webTagLabel: "Contact Center Web Tag（Import SDK）",
          webTagHelp:
            "请粘贴完整的script标签。此字段中的标签必须包含data-chat-entry-id。",
          memoLabel: "Contact Center备注（可选）",
          memoHelp:
            "供管理员使用的内部备注，不会在公开网站上显示或用于其运行（最多4,000个字符）。",
        },
      },
      languageManagement: {
        title: "语言管理",
        description: "设置公开网站语言菜单中显示的语言及其排列顺序。",
        enabledCountLabel: "显示语言数",
        japaneseRequired: "必需",
        moveUp: "上移",
        moveDown: "下移",
      },
      maintenanceManagement: {
        title: "维护管理",
        description: "选择公开网站正常开放、立即进入维护或按预约时间进入维护。",
        environmentLabel: "目标环境",
        environments: {
          production: "生产",
          preview: "预览",
          development: "开发",
        },
        effectiveStateTitle: "当前实际状态",
        effectiveActive: "维护中",
        effectiveInactive: "正常开放中",
        effectiveUnknown: "无法判断",
        currentValueUnavailableTitle: "无法获取当前设置",
        currentValueUnavailableDescription:
          "为防止意外更改公开状态，输入和保存功能已停用。请稍后重新加载此页面。",
        modeTitle: "公开模式",
        modeDescription: "请选择一种应用于公开网站的模式。",
        modes: {
          disabled: {
            label: "正常开放",
            description: "显示公开网站的常规内容。",
          },
          enabled: {
            label: "立即开始维护",
            description: "保存后将公开网站切换为维护页面。",
          },
          scheduled: {
            label: "预约时间",
            description: "在指定的开始时间至结束时间显示维护页面。",
          },
        },
        scheduleTitle: "预约时间",
        scheduleDescription:
          "选择预约时间模式时使用。切换到其他模式后，已保存的时间仍会保留。",
        scheduledStartLabel: "开始日期和时间（JST）",
        scheduledEndLabel: "结束日期和时间（JST）",
        timeZoneNote: "请按日本标准时间（JST）输入日期和时间。",
        scheduleRequired: "请输入开始日期和时间以及结束日期和时间。",
        scheduleOrderError: "结束日期和时间必须晚于开始日期和时间。",
        scheduleEndFutureError: "结束日期和时间必须晚于当前时间。",
        conflictError:
          "另一位管理员已更新设置。您输入的内容已保留。请重新加载页面并确认最新设置，然后再次保存。",
        warningTitle: "公开网站的显示将会切换",
        warningDescription:
          "维护期间无法使用公开网站的常规内容、页眉、页脚和AI聊天。管理页面和认证页面仍可使用。",
        propagationNote: "保存的设置将在下一次网络请求时生效。",
        updatedAtLabel: "最后更新",
      },
    },
  },
  "zh-Hant": {
    nav: {
      access: "交通・設施導覽",
      language: "語言",
      openMenu: "開啟選單",
      closeMenu: "關閉選單",
    },
    theme: {
      light: "淺色",
      dark: "深色",
    },
    maintenance: {
      title: "網站維護中",
      description: "本網站目前正在進行計畫維護，將很快恢復服務。",
    },
    findInfo: {
      title: "尋找資訊",
      subtitle: "Find information",
      sectionLabel: "諮詢 Zoom AI",
      call: {
        title: "AI 電話諮詢",
        description:
          "由 AI 進行初次應答，高度諮詢或涉及個人資訊的諮詢將轉接至真人客服。",
        unavailableAlert: "尚未設定 AI 電話諮詢的電話號碼。",
      },
    },
    news: {
      title: "通知公告",
      subtitle: "Information",
      more: "查看更多",
      close: "收合",
      category: { new: "最新消息", featured: "重點關注" },
    },
    contentPages: {
      breadcrumbLabel: "麵包屑導覽",
      tableOfContents: "本頁目錄",
      home: "首頁",
      newsIndexTitle: "通知公告",
      allNews: "查看所有通知公告",
      categoryLead:
        "本頁彙整與「{name}」相關的主要辦理事項和服務。請選擇您想瞭解的項目。",
      topicCardLead: "查看「{name}」的概要與辦理重點。",
      topicLead: "本頁介紹「{name}」的概要、需確認事項及使用方式。",
      topicsHeading: "主要辦理事項與服務",
      overviewHeading: "概要",
      checkHeading: "請先確認",
      checkEligibility: "適用對象",
      checkDocuments: "所需文件",
      checkHowToUse: "辦理或使用方式",
      checkEligibilityDescription:
        "請確認各項指南中列明的適用年齡、居住條件和受理期間等條件。未列明條件的資訊可直接使用。",
      checkDocumentsDescription:
        "如需申請或預約，請事先確認本人身分證明、當日需攜帶的物品等必要文件。",
      checkHowToUseDescription:
        "請確認頁面內容，並視需要透過線上、辦事窗口或電話辦理手續或進行諮詢。",
      newsScopeHeading: "適用對象與影響範圍",
      newsScopeDescription:
        "請確認本通知適用的人員和地區，以及可能受影響的手續或服務。",
      newsConfirmationHeading: "確認事項",
      newsConfirmationDescription:
        "請依通知內容確認實施時間、條件和注意事項等必要資訊。",
      newsActionHeading: "下一步",
      newsActionDescription: "請依通知內容進行申請、預約、諮詢或確認後續更新。",
      contactHeading: "諮詢方式",
      contactPhoneLabel: "電話",
      backToCategory: "返回分類頁面",
      publishedLabel: "發布日期",
      readMore: "查看詳情",
      faq: {
        indexLead: "按部門和局分類查看未來市的常見問題。",
        departmentsHeading: "依部門或局查詢",
        departmentLead: "依分類查看有關{name}的常見問題。",
        categoriesHeading: "常見問題分類",
        categoryLead: "查看有關{name}的常見問題與解答。",
        questionsHeading: "常見問題",
        questionCount: "共{count}個問題",
        backToIndex: "返回常見問題一覽",
        backToDepartment: "返回本部門或局的常見問題一覽",
      },
    },
    footer: {
      terms: "使用條款",
      privacy: "隱私權政策",
      feedback: "意見・需求",
      sitemap: "網站地圖",
      login: "登入",
      goToAdmin: "管理頁面",
      phoneLabel: "電話號碼：",
      phoneNote: "（總機）",
    },
    docs: {
      viewAsMarkdown: "檢視 Markdown 版本",
    },
    links: {
      opensInNewTab: "在新分頁中開啟",
    },
    auth: {
      loginTitle: "管理登入",
      loginDescription:
        "存取面向示範營運者的文章編輯、電話號碼變更等管理功能。",
      email: "電子郵件地址",
      password: "密碼",
      currentPassword: "目前密碼",
      newPassword: "新密碼",
      showPassword: "顯示密碼",
      hidePassword: "隱藏密碼",
      name: "姓名",
      role: "權限",
      roleUser: "一般使用者",
      roleAdmin: "管理員",
      login: "登入",
      signOut: "登出",
      forgotPassword: "申請重設密碼",
      forgotPasswordTitle: "密碼重設申請",
      forgotPasswordDescription: "管理員將確認申請並發放新的臨時密碼。",
      requestReset: "申請重設",
      resetRequestSent: "已受理申請。請等待管理員通知。",
      changePasswordTitle: "變更密碼",
      changePasswordDescription: "使用臨時密碼登入後，請先變更為新密碼。",
      changePassword: "變更密碼",
      passwordChanged: "密碼已變更。",
      temporaryPassword: "臨時密碼",
      temporaryPasswordDescription:
        "臨時密碼只會顯示一次。請透過安全方式分享給目標使用者。",
      copyTemporaryPassword: "複製臨時密碼",
      temporaryPasswordCopied: "已複製臨時密碼。",
      temporaryPasswordCopyFailed: "無法複製。請選取臨時密碼並手動複製。",
      required: "必填",
      error: "處理失敗。",
    },
    admin: {
      industrySettings: {
        openUniversitySettings: "開啟大學設定",
        saveError: "無法儲存。已保留輸入內容，請再試一次。",
        saving: "正在儲存...",
        pageHelpLabel: "頁面說明",
        pageHelpDescription: "編輯所選行業的{title}設定。",
        placeholder: "選擇行業",
        "label": "設定對象行業",
        "help": "選擇要在此頁面編輯的行業。",
        "scope": "儲存{tenant}在此頁面所有分頁中的設定。",
        "saved": "已儲存{tenant}的設定。",
        "dirty": "有未儲存的變更。",
        "loading": "正在載入{tenant}的設定。",
        "loadError": "無法載入{tenant}的設定。",
        "retry": "重新載入",
        "readonly": "僅可檢視。您沒有編輯權限。",
        "invalid": "該行業無法使用。",
        "continue": "繼續編輯",
        "discard": "捨棄變更並切換",
        "confirmTitle": "捨棄未儲存的變更？",
        "confirmTenant": "{tenant}的變更尚未儲存。切換至{destination}將捨棄輸入的變更。",
        "confirmPage": "{tenant}的變更尚未儲存。開啟{destination}將捨棄輸入的變更。",
        "consultationTitle": "線上諮詢管理",
        "consultationDescription": "為所選行業的線上諮詢窗口設定連線網頁標籤。",
        "consultationConnectionLabel": "{service}連線設定",
        "consultationTagDescription": "設定線上諮詢服務提供的連線網頁標籤。",
        "tag": "連線網頁標籤",
        "tagHelp": "僅接受符合規範的連線網頁標籤。",
        "memo": "管理備註",
        "invalidInput": "請檢查輸入內容。",
        "names": {
          "lg": "地方政府（未來市）",
          "univ": "大學（未來大學）"
        },
        "services": {
          "general": "綜合諮詢",
          "admissions": "入學與招生",
          "student-support": "學生生活與獎學金",
          "careers": "就業輔導"
        }
      },
      title: "管理頁面",
      pageDescriptionLabel: "關於{title}",
      users: "使用者管理",
      newUser: "建立使用者",
      createUserAction: "建立",
      passwordResets: "重設申請",
      phoneSettings: "電話管理",
      chatSettings: "AI聊天管理",
      onlineConsultation: "線上諮詢",
      languageSettings: "語言管理",
      maintenanceSettings: "維護管理",
      developerApi: "Developer API",
      reservations: "預約系統",
      settingsMenu: "設定",
      navigation: {
        usersSection: "使用者",
        settingsSection: "設定",
        usersSectionNavigation: "使用者管理分區",
        settingsSectionNavigation: "設定管理分區",
        backToSite: "返回公開網站",
        openMenu: "開啟導覽",
        closeMenu: "關閉導覽",
        collapseSidebar: "收合側邊導覽",
        expandSidebar: "展開側邊導覽",
        accountMenuLabel: "帳戶操作",
        openAccountMenu: "開啟{name}的帳戶選單",
        closeAccountMenu: "關閉{name}的帳戶選單",
      },
      reservationManagement: reservationManagementCopy["zh-Hant"],
      zaad: zaadDictionaries["zh-Hant"],
      userListTitle: "使用者管理",
      searchPlaceholder: "依姓名或電子郵件搜尋",
      search: "搜尋",
      clear: "清除",
      createUserTitle: "管理員建立使用者",
      createUserDescription: "發放首次登入用臨時密碼，並要求首次登入後變更。",
      createUser: "建立使用者",
      email: "電子郵件地址",
      name: "姓名",
      role: "權限",
      mustChangePassword: "需要變更密碼",
      createdAt: "建立時間",
      status: "狀態",
      requestedAt: "申請時間",
      reviewedAt: "確認時間",
      approve: "核准",
      reject: "拒絕",
      pending: "待處理",
      approved: "已核准",
      rejected: "已拒絕",
      consumed: "已變更",
      noUsers: "沒有符合條件的使用者。",
      noResetRequests: "沒有密碼重設申請。",
      page: "頁面",
      paginationLabel: "使用者列表分頁",
      previous: "上一頁",
      next: "下一頁",
      issuedPasswordTitle: "已發放臨時密碼",
      issuedPasswordDescription:
        "關閉此畫面後無法再次顯示。分享後請使用者登入並變更密碼。",
      adminOnly: "僅限管理員存取。",
      myPage: {
        title: "我的頁面",
        description: "查看目前登入的帳戶資訊。",
        name: "姓名",
        email: "電子郵件地址",
        noAccess: "您目前沒有可用的管理功能。如需使用，請聯絡管理員。",
        denied: "您沒有存取此頁面的權限。",
      },
      accessControl: {
        rolesNav: "角色",
        listTitle: "角色",
        listDescription: "透過各個角色控制管理頁面存取。明確拒絕優先於允許。",
        roleCount: "個角色",
        addRole: "新增角色",
        createTitle: "新增角色",
        createDescription:
          "輸入角色名稱和說明。建立時所有管理頁面權限皆為未選取狀態。",
        roleName: "角色名稱",
        roleNameRequired: "請輸入角色名稱。",
        roleNameTooLong: "角色名稱不得超過 64 個字元。",
        roleDescription: "說明",
        descriptionOptional: "說明（選填）",
        memberCount: "成員數",
        actions: "動作",
        edit: "編輯",
        editRoleTitle: "編輯角色",
        editRoleDescription: "編輯角色名稱和說明。",
        systemRole: "系統角色",
        systemRoleReadOnly: "系統角色無法變更。",
        noRoles: "沒有角色。",
        cancel: "取消",
        add: "新增",
        saving: "儲存中…",
        save: "儲存",
        saved: "角色設定已儲存。",
        reload: "重新載入最新資訊",
        deleteRole: "刪除角色",
        backToRoles: "返回角色清單",
        backToUserDetails: "返回使用者詳細資料",
        settingsTab: "角色設定",
        membersTab: "角色成員",
        adminPageAccessTitle: "管理頁面存取權",
        adminPageAccessDescription:
          "取消「檢視」後，同一頁面的建立、編輯及刪除也不會獲准。",
        adminPageColumn: "管理頁面",
        allow: "允許",
        deny: "拒絕",
        unset: "未設定",
        unsupported: "不適用",
        path: "路徑",
        targetPaths: "目標路徑",
        assignedRoles: "已指派角色",
        noAssignedRoles: "未指派角色。",
        effectiveAccess: "有效存取權",
        userAccessPageTitle: "使用者存取權 | 未來市管理頁面",
        userAccessTitle: "使用者有效存取權",
        userAccessHeading: "{name}的存取權",
        userAccessDescription: "這是套用指派角色及管理員附加條件後的最終結果。",
        viewAccess: "檢視存取權",
        allowed: "允許",
        denied: "拒絕",
        genericError: "無法處理角色。",
        conflictError: "角色已在其他位置變更，請重新載入。",
        duplicateError: "已存在同名角色。",
        listSearchPlaceholder: "以角色名稱或 ID 搜尋",
        memberSearchPlaceholder: "以姓名、電子郵件或 ID 搜尋成員",
        candidateSearchPlaceholder: "以姓名、電子郵件或 ID 搜尋可新增使用者",
        assignUsers: "新增使用者",
        assign: "指派",
        removeAssignment: "移除指派",
        noMembers: "沒有使用者被指派到此角色。",
        noCandidates: "沒有可新增的使用者。",
        candidateDialogTitle: "新增角色成員",
        candidateDialogDescription: "取代所選使用者目前的存取角色。",
        deleteRoleTitle: "要刪除此角色嗎？",
        deleteRoleDescription: "角色及其權限設定將被永久刪除，此操作無法復原。",
        roleInUse: "刪除此角色前，請移除所有成員指派。",
        readOnlyRoleAction: "您沒有執行此操作的權限。",
        adminAttributeHelp: "作為管理使用者操作的附加條件。",
        assignedRolesHelp:
          "決定每個管理頁面的檢視、建立、編輯及刪除權限。每位使用者只能擁有一個角色。",
        accessRoleSummaryHelp: "決定每個管理頁面的檢視、建立、編輯及刪除權限。",
        replaceAccessRoleHelp: "儲存後，目前存取角色會替換為所選角色。",
        loading: "載入中…",
        accountSuspended: "由於該使用者已停用，所有存取均被拒絕。",
        passwordChangeRequired: "完成首次密碼變更前，所有存取均被拒絕。",
        systemRoleNames: {
          FULL_ACCESS: "完全存取權限",
          NO_ACCESS: "無存取權限",
        },
        systemRoleDescriptions: {
          FULL_ACCESS: "允許所有支援的管理動作。",
          NO_ACCESS: "不授予任何權限，因此所有動作都會被隱含拒絕。",
        },
        resourceTitles: {
          users: "管理使用者",
          "password-reset-requests": "密碼重設申請",
          roles: "角色管理",
          "role-assignments": "角色成員",
          "phone-settings": "電話設定",
          "chat-settings": "AI聊天設定",
          "language-settings": "語言設定",
          "maintenance-settings": "維護設定",
          "developer-api": "Developer API",
          reservations: "預約系統",
          zaad: "AutoReach",
        },
        resourceDescriptions: {
          users: "管理使用者清單、詳細資料、建立、權限、狀態、密碼及存取摘要。",
          "password-reset-requests": "檢視、核准及拒絕申請。",
          roles: "管理存取角色、說明及權限。",
          "role-assignments": "檢視及變更每位使用者的單一存取角色。",
          "phone-settings": "管理代表電話號碼及 AI 電話號碼。",
          "chat-settings": "管理 Web Chat 模式及連線設定。",
          "language-settings": "管理公開網站語言及顯示順序。",
          "maintenance-settings": "管理各環境的模式及排程。",
          "developer-api": "管理外部整合使用的 API 與 Webhook 認證資訊。",
          reservations: "查看市政服務預約狀況並產生示範預約。",
          zaad: "管理防災行政無線居民、外撥訊息、聯絡人清單與活動。",
        },
        actionLabels: {
          VIEW: "檢視",
          CREATE: "新增",
          UPDATE: "編輯",
          DELETE: "刪除",
        },
      },
      userManagement: {
        detailsPageTitle: "使用者詳細資料 | 未來市管理頁面",
        detailsTitle: "使用者詳細資料",
        detailsDescription: "管理使用者資訊、權限、存取角色及密碼。",
        detailsReadOnly:
          "您可以檢視此使用者。變更使用者資訊需要使用者編輯權限。",
        name: "姓名",
        accessRoles: "存取角色",
        backToUsers: "返回使用者管理",
        settings: "設定",
        actionsFor: "設定對象",
        edit: "編輯",
        suspend: "停用",
        reactivate: "重新啟用",
        delete: "刪除",
        active: "有效",
        suspended: "已停用",
        save: "儲存",
        saving: "儲存中…",
        cancel: "取消",
        saved: "變更已儲存。",
        password: "密碼",
        resetPassword: "重設",
        passwordConfigured: "已設定",
        passwordChangeRequired: "下次登入後需要變更",
        passwordVisibilityHelp: "無法顯示其他使用者的密碼。",
        selfPasswordResetProtected: "請從變更密碼頁面修改自己的密碼。",
        passwordMode: "密碼類型",
        temporaryPasswordMode: "臨時密碼",
        temporaryPasswordModeDescription:
          "要求使用者在下次登入後自行變更密碼。",
        standardPasswordMode: "一般密碼",
        standardPasswordModeDescription: "使用者可以繼續使用管理員設定的密碼。",
        newPassword: "新密碼",
        confirmPassword: "確認新密碼",
        passwordsMatch: "兩次輸入的密碼一致。",
        passwordRequirements: "請輸入12至128個字元。",
        generateTemporaryPassword: "自動產生臨時密碼",
        revokeSessions: "變更後強制登出",
        revokeSessionsDescription: "啟用後將結束此使用者的所有現有工作階段。",
        enabled: "是",
        disabled: "否",
        passwordDialogTitle: "要重設密碼嗎？",
        passwordDialogDescription:
          "請確認設定後再重設密碼。重設後舊密碼將無法繼續使用。",
        confirmPasswordReset: "重設密碼",
        passwordResetSaved: "密碼已重設。",
        selfProtected: "無法對自己的帳戶執行此操作。",
        lastAdminProtected: "無法對最後一名有效管理員執行此操作。",
        emailDialogTitle: "要變更電子郵件地址嗎？",
        emailDialogDescription: "變更後將使用新地址登入。請確認內容後再變更。",
        currentEmail: "目前的電子郵件地址",
        newEmail: "新的電子郵件地址",
        changeEmail: "變更電子郵件地址",
        suspendDialogTitle: "要停用此使用者嗎？",
        suspendDialogDescription:
          "使用者目前的工作階段將結束，重新啟用前將無法登入。",
        reactivateDialogTitle: "要重新啟用此使用者嗎？",
        reactivateDialogDescription: "解除停用狀態，允許此使用者再次登入。",
        deleteDialogTitle: "要刪除此使用者嗎？",
        deleteDialogDescription:
          "使用者及其驗證資訊將被永久刪除。此操作無法復原。",
        targetUser: "目標使用者",
        errors: {
          AUTHENTICATION_REQUIRED: "請先登入。",
          ADMINISTRATOR_REQUIRED: "需要管理員權限。",
          PASSWORD_CHANGE_REQUIRED: "請先變更密碼。",
          INVALID_REQUEST: "要求內容無效。",
          INVALID_NAME: "請輸入姓名。",
          INVALID_EMAIL: "請輸入有效的電子郵件地址。",
          EMAIL_ALREADY_EXISTS: "此電子郵件地址已被使用。",
          INVALID_ROLE: "請選擇有效的權限。",
          INVALID_PASSWORD: "請輸入12至128個字元的密碼。",
          PASSWORD_MISMATCH: "兩次輸入的密碼不一致。",
          USER_NOT_FOUND: "找不到目標使用者。",
          SELF_PROTECTED: "無法對自己的帳戶執行此操作。",
          LAST_ACTIVE_ADMIN: "無法對最後一名有效管理員執行此操作。",
          UPDATE_FAILED: "無法更新使用者資訊。",
          SUSPEND_FAILED: "無法停用使用者。",
          REACTIVATE_FAILED: "無法重新啟用使用者。",
          DELETE_FAILED: "無法刪除使用者。",
          RESET_PASSWORD_FAILED: "無法重設密碼。",
          SESSION_REVOCATION_FAILED: "密碼已變更，但無法結束現有工作階段。",
        },
      },
      settings: {
        save: "儲存設定",
        saving: "正在儲存…",
        saved: "設定已儲存。",
        saveError: "無法儲存設定。",
        pageSaveScope: "儲存此頁面所有分頁的設定。",
        sectionSaveScope: "儲存此區段的設定。",
        errors: {
          AUTHENTICATION_REQUIRED: "請先登入。",
          ADMINISTRATOR_REQUIRED: "需要管理員權限。",
          PASSWORD_CHANGE_REQUIRED: "請先變更密碼，再更新設定。",
          INVALID_REQUEST: "請檢查輸入內容。",
          INVALID_REPRESENTATIVE_PHONE_DISPLAY:
            "代表電話號碼的顯示值包含不支援的字元。",
          INVALID_REPRESENTATIVE_PHONE_E164:
            "請以E.164格式輸入代表電話的撥號號碼。",
          INVALID_AI_PHONE_E164: "請以E.164格式輸入AI電話號碼。",
          INVALID_ZOOM_CAMPAIGN_WEB_TAG:
            "請在Campaign欄位中輸入由Zoom Campaign設定簽發的有效Web Tag。",
          INVALID_ZOOM_CONTACT_CENTER_WEB_TAG:
            "請在Contact Center Entry ID欄位中輸入包含data-chat-entry-id的有效Web Tag。",
          ACTIVE_ZOOM_CHAT_TAG_REQUIRED: "請輸入所選聊天方式的Web Tag。",
          INVALID_CHAT_MEMO: "管理備註不能超過4,000個字元。",
          INVALID_LANGUAGE_SETTINGS: "請將5種語言各指定一次且不要重複。",
          JAPANESE_REQUIRED: "不能停用日語。",
          SETTINGS_SAVE_FAILED: "無法儲存設定。",
        },
      },
      phoneManagement: {
        title: "電話管理",
        description: "設定代表電話以及公開網站各語言使用的AI電話諮詢號碼。",
        representativeTitle: "代表電話",
        representativeDescription:
          "設定在共用頁尾顯示的電話號碼以及撥號時使用的號碼。",
        representativeDisplayLabel: "顯示用電話號碼",
        representativeDisplayHelp: "範例：(03)1234-5678",
        representativeE164Label: "撥號電話號碼（E.164）",
        representativeE164Help: "範例：+81312345678",
        aiPhoneTitle: "AI 電話諮詢",
        aiPhoneDescription:
          "依公開網站目前選擇的語言設定撥打號碼。留白時儲存為未設定。",
        aiPhoneLabel: "AI電話號碼（E.164）",
        hidden: "已隱藏",
      },
      developerApiManagement: {
        title: "Developer API",
        description: "設定外部整合使用的認證資訊與 Webhook Secret Token。",
        oauthTitle: "Server To Server OAuth",
        oauthDescription: "設定連線至 Zoom API 時使用的認證資訊。",
        webhookTitle: "Webhook Only app",
        webhookDescription: "設定驗證 Webhook 時使用的 Secret Token。",
        accountId: "Account ID",
        clientId: "Client ID",
        clientSecret: "Client Secret",
        secretToken: "Secret Token",
        errors: {
          DEVELOPER_API_INVALID_REQUEST: "請檢查輸入內容。",
          DEVELOPER_API_INVALID_ACCOUNT_ID:
            "Account ID 請輸入 1 至 255 個字元。",
          DEVELOPER_API_INVALID_CLIENT_ID: "Client ID 請輸入 1 至 255 個字元。",
          DEVELOPER_API_OAUTH_SECRET_REQUIRED:
            "首次儲存 Server-To-Server OAuth 時需要 Client Secret。",
          DEVELOPER_API_WEBHOOK_SECRET_REQUIRED:
            "首次儲存 Webhook only app 時需要 Secret Token。",
          DEVELOPER_API_ENCRYPTION_UNAVAILABLE:
            "加密設定無法使用，因此無法儲存。",
          DEVELOPER_API_SECRET_NOT_CONFIGURED: "沒有可顯示的已設定 Secret。",
          DEVELOPER_API_SECRET_REVEAL_FAILED: "無法顯示 Secret。",
          DEVELOPER_API_SAVE_FAILED: "無法儲存 Developer API 設定。",
        },
      },
      chatManagement: {
        title: "AI聊天管理",
        description:
          "設定公開網站使用的Zoom聊天方式以及兩種方式各自的Web Tag。未選取方式的設定也會保留。",
        methodTab: "使用方式",
        campaignTab: "活動",
        activeModeTitle: "公開網站使用的方式",
        activeModeDescription:
          "請選擇一種方式。切換方式不會清除已儲存的Campaign或Entry ID內容。",
        active: "使用中",
        inactive: "未使用",
        modes: {
          disabled: {
            label: "不使用",
            description: "公開網站不載入Zoom聊天SDK。已儲存的標籤會繼續保留。",
          },
          campaign: {
            label: "Campaign",
            description: "依照Zoom Campaign中設定的目標URL和投放條件顯示聊天。",
          },
          contactCenterEntryId: {
            label: "Contact Center Entry ID",
            description: "使用指定Contact Center流程的Entry ID啟動聊天。",
          },
        },
        campaign: {
          title: "Campaign",
          description:
            "請貼上從Zoom管理頁面的「Contact Center Management > Campaigns > Embed Web Tag」複製的標籤。",
          webTagLabel: "Campaign Web Tag（Embed Web Tag）",
          webTagHelp:
            "請貼上完整的script標籤。此欄位不能使用包含data-chat-entry-id的標籤。",
          memoLabel: "Campaign備註（選填）",
          memoHelp:
            "供管理員使用的內部備註，不會在公開網站上顯示或用於其運作（最多4,000個字元）。",
        },
        contactCenterEntryId: {
          title: "Contact Center Entry ID",
          description:
            "請貼上從目標流程的「Start > Manage Entry Point > Import SDK」複製的標籤。",
          webTagLabel: "Contact Center Web Tag（Import SDK）",
          webTagHelp:
            "請貼上完整的script標籤。此欄位中的標籤必須包含data-chat-entry-id。",
          memoLabel: "Contact Center備註（選填）",
          memoHelp:
            "供管理員使用的內部備註，不會在公開網站上顯示或用於其運作（最多4,000個字元）。",
        },
      },
      languageManagement: {
        title: "語言管理",
        description: "設定公開網站語言選單中顯示的語言及其排列順序。",
        enabledCountLabel: "顯示語言數",
        japaneseRequired: "必須",
        moveUp: "上移",
        moveDown: "下移",
      },
      maintenanceManagement: {
        title: "維護管理",
        description: "選擇公開網站正常開放、立即進入維護或依預約時間進入維護。",
        environmentLabel: "目標環境",
        environments: {
          production: "正式",
          preview: "預覽",
          development: "開發",
        },
        effectiveStateTitle: "目前實際狀態",
        effectiveActive: "維護中",
        effectiveInactive: "正常開放中",
        effectiveUnknown: "無法判斷",
        currentValueUnavailableTitle: "無法取得目前設定",
        currentValueUnavailableDescription:
          "為防止意外變更公開狀態，輸入與儲存功能已停用。請稍後重新載入此頁面。",
        modeTitle: "公開模式",
        modeDescription: "請選擇一種套用於公開網站的模式。",
        modes: {
          disabled: {
            label: "正常開放",
            description: "顯示公開網站的一般內容。",
          },
          enabled: {
            label: "立即開始維護",
            description: "儲存後將公開網站切換為維護頁面。",
          },
          scheduled: {
            label: "預約時間",
            description: "在指定的開始時間至結束時間顯示維護頁面。",
          },
        },
        scheduleTitle: "預約時間",
        scheduleDescription:
          "選擇預約時間模式時使用。切換至其他模式後，已儲存的時間仍會保留。",
        scheduledStartLabel: "開始日期與時間（JST）",
        scheduledEndLabel: "結束日期與時間（JST）",
        timeZoneNote: "請依日本標準時間（JST）輸入日期與時間。",
        scheduleRequired: "請輸入開始日期與時間以及結束日期與時間。",
        scheduleOrderError: "結束日期與時間必須晚於開始日期與時間。",
        scheduleEndFutureError: "結束日期與時間必須晚於目前時間。",
        conflictError:
          "另一位管理員已更新設定。您輸入的內容已保留。請重新載入頁面並確認最新設定，然後再次儲存。",
        warningTitle: "公開網站的顯示將會切換",
        warningDescription:
          "維護期間無法使用公開網站的一般內容、頁首、頁尾與AI聊天。管理頁面與驗證頁面仍可使用。",
        propagationNote: "儲存的設定將於下一次網路請求時生效。",
        updatedAtLabel: "最後更新",
      },
    },
  },
  ko: {
    nav: {
      access: "오시는 길・시설 안내",
      language: "언어",
      openMenu: "메뉴 열기",
      closeMenu: "메뉴 닫기",
    },
    theme: {
      light: "라이트",
      dark: "다크",
    },
    maintenance: {
      title: "웹사이트 점검 중",
      description:
        "현재 이 웹사이트는 예정된 점검을 진행하고 있습니다. 곧 서비스를 재개하겠습니다.",
    },
    findInfo: {
      title: "정보 찾기",
      subtitle: "Find information",
      sectionLabel: "Zoom AI 상담",
      call: {
        title: "AI 전화 상담",
        description:
          "상담 내용을 AI가 1차 응대하며, 고도의 상담이나 개인정보와 관련된 상담은 상담원에게 연결해 드립니다.",
        unavailableAlert: "AI 전화 상담 전화번호가 설정되어 있지 않습니다.",
      },
    },
    news: {
      title: "알림",
      subtitle: "Information",
      more: "더 보기",
      close: "닫기",
      category: { new: "새소식", featured: "주요 정보" },
    },
    contentPages: {
      breadcrumbLabel: "현재 위치",
      tableOfContents: "페이지 목차",
      home: "홈",
      newsIndexTitle: "알림",
      allNews: "전체 알림",
      categoryLead: "{name}에 관한 주요 정보를 안내합니다.",
      topicCardLead: "{name}의 개요와 수속 시 확인할 사항을 안내합니다.",
      topicLead: "{name}의 개요와 수속 시 확인할 사항을 안내합니다.",
      topicsHeading: "주요 정보",
      overviewHeading: "개요",
      checkHeading: "확인 사항",
      checkEligibility: "이용 대상",
      checkDocuments: "필요 서류",
      checkHowToUse: "이용・신청 방법",
      checkEligibilityDescription:
        "대상 연령, 거주 요건, 접수 기간 등 각 안내에 기재된 조건을 확인해 주세요. 별도 조건이 없는 정보는 그대로 이용할 수 있습니다.",
      checkDocumentsDescription:
        "신청이나 예약이 필요한 경우에는 본인 확인 서류와 당일 지참물 등 필요한 사항을 미리 확인해 주세요.",
      checkHowToUseDescription:
        "게시된 내용을 확인한 후 필요에 따라 온라인, 민원 창구 또는 전화로 수속하거나 상담해 주세요.",
      newsScopeHeading: "대상・영향 범위",
      newsScopeDescription:
        "이 알림의 대상자와 지역, 영향을 받는 수속이나 서비스를 확인해 주세요.",
      newsConfirmationHeading: "확인 사항",
      newsConfirmationDescription:
        "시행 시기, 조건, 주의사항 등 알림 내용에 따른 필요 정보를 확인해 주세요.",
      newsActionHeading: "다음 단계",
      newsActionDescription:
        "신청, 예약, 상담, 최신 상황 확인 등 알림에 기재된 방법에 따라 조치해 주세요.",
      contactHeading: "문의",
      contactPhoneLabel: "전화",
      backToCategory: "이 카테고리로 돌아가기",
      publishedLabel: "게시일",
      readMore: "자세히 보기",
      faq: {
        indexLead: "미래시의 자주 묻는 질문을 과·국별로 안내합니다.",
        departmentsHeading: "과·국별로 찾기",
        departmentLead:
          "{name}에 관한 자주 묻는 질문을 카테고리별로 안내합니다.",
        categoriesHeading: "FAQ 카테고리",
        categoryLead: "{name}에 관한 자주 묻는 질문과 답변을 안내합니다.",
        questionsHeading: "자주 묻는 질문",
        questionCount: "질문 {count}개",
        backToIndex: "자주 묻는 질문 목록으로 돌아가기",
        backToDepartment: "이 과·국의 FAQ 목록으로 돌아가기",
      },
    },
    footer: {
      terms: "이용약관",
      privacy: "개인정보 보호정책",
      feedback: "의견・요청",
      sitemap: "사이트맵",
      login: "로그인",
      goToAdmin: "관리 화면",
      phoneLabel: "전화번호：",
      phoneNote: "（대표）",
    },
    docs: {
      viewAsMarkdown: "Markdown 버전 보기",
    },
    links: {
      opensInNewTab: "새 탭에서 열립니다",
    },
    auth: {
      loginTitle: "관리 로그인",
      loginDescription:
        "데모 운영자를 위한 기사 작성, 전화번호 변경 등의 관리 기능에 접근합니다.",
      email: "이메일 주소",
      password: "비밀번호",
      currentPassword: "현재 비밀번호",
      newPassword: "새 비밀번호",
      showPassword: "비밀번호 표시",
      hidePassword: "비밀번호 숨기기",
      name: "이름",
      role: "권한",
      roleUser: "일반 사용자",
      roleAdmin: "관리자",
      login: "로그인",
      signOut: "로그아웃",
      forgotPassword: "비밀번호 재설정 신청",
      forgotPasswordTitle: "비밀번호 재설정 신청",
      forgotPasswordDescription:
        "관리자가 신청을 확인하고 새 임시 비밀번호를 발급합니다.",
      requestReset: "재설정 신청",
      resetRequestSent: "신청을 접수했습니다. 관리자의 안내를 기다려 주세요.",
      changePasswordTitle: "비밀번호 변경",
      changePasswordDescription:
        "임시 비밀번호로 로그인한 경우 계속하기 전에 새 비밀번호로 변경하세요.",
      changePassword: "비밀번호 변경",
      passwordChanged: "비밀번호를 변경했습니다.",
      temporaryPassword: "임시 비밀번호",
      temporaryPasswordDescription:
        "임시 비밀번호는 한 번만 표시됩니다. 안전한 방법으로 대상 사용자에게 공유하세요.",
      copyTemporaryPassword: "임시 비밀번호 복사",
      temporaryPasswordCopied: "임시 비밀번호를 복사했습니다.",
      temporaryPasswordCopyFailed:
        "복사하지 못했습니다. 임시 비밀번호를 선택하여 직접 복사해 주세요.",
      required: "필수",
      error: "처리에 실패했습니다.",
    },
    admin: {
      industrySettings: {
        openUniversitySettings: "대학 설정 열기",
        saveError: "저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도하세요.",
        saving: "저장 중...",
        pageHelpLabel: "페이지 설명",
        pageHelpDescription: "선택한 업종의 {title} 설정을 편집합니다.",
        placeholder: "업종 선택",
        "label": "설정 대상 업종",
        "help": "이 페이지에서 편집할 업종을 선택하세요.",
        "scope": "{tenant}의 이 페이지에 있는 모든 탭 설정을 저장합니다.",
        "saved": "{tenant}의 설정을 저장했습니다.",
        "dirty": "저장하지 않은 변경 사항이 있습니다.",
        "loading": "{tenant}의 설정을 불러오는 중입니다.",
        "loadError": "{tenant}의 설정을 불러오지 못했습니다.",
        "retry": "다시 불러오기",
        "readonly": "조회만 가능합니다. 편집 권한이 없습니다.",
        "invalid": "이 업종은 사용할 수 없습니다.",
        "continue": "계속 편집",
        "discard": "변경 사항을 버리고 전환",
        "confirmTitle": "저장하지 않은 변경 사항을 버릴까요?",
        "confirmTenant": "{tenant}의 변경 사항이 저장되지 않았습니다. {destination}(으)로 전환하면 입력한 변경 사항이 사라집니다.",
        "confirmPage": "{tenant}의 변경 사항이 저장되지 않았습니다. {destination}(으)로 이동하면 입력한 변경 사항이 사라집니다.",
        "consultationTitle": "온라인 상담 관리",
        "consultationDescription": "선택한 업종의 온라인 상담 창구에 연결용 웹 태그를 설정합니다.",
        "consultationConnectionLabel": "{service} 연결 설정",
        "consultationTagDescription": "온라인 상담 서비스에서 발급한 연결용 웹 태그를 설정합니다.",
        "tag": "연결용 웹 태그",
        "tagHelp": "규격에 맞는 연결용 웹 태그만 허용합니다.",
        "memo": "관리 메모",
        "invalidInput": "입력 내용을 확인하세요.",
        "names": {
          "lg": "지방자치단체 (미래시)",
          "univ": "대학교 (미래대학교)"
        },
        "services": {
          "general": "종합 상담",
          "admissions": "입학·입시",
          "student-support": "학생 생활·장학금",
          "careers": "진로"
        }
      },
      title: "관리 화면",
      pageDescriptionLabel: "{title} 정보",
      users: "사용자 관리",
      newUser: "사용자 생성",
      createUserAction: "생성",
      passwordResets: "재설정 신청",
      phoneSettings: "전화 관리",
      chatSettings: "AI 채팅 관리",
      onlineConsultation: "온라인 상담",
      languageSettings: "언어 관리",
      maintenanceSettings: "점검 관리",
      developerApi: "Developer API",
      reservations: "예약 시스템",
      settingsMenu: "설정",
      navigation: {
        usersSection: "사용자",
        settingsSection: "설정",
        usersSectionNavigation: "사용자 관리 섹션",
        settingsSectionNavigation: "설정 관리 섹션",
        backToSite: "공개 사이트로 돌아가기",
        openMenu: "탐색 열기",
        closeMenu: "탐색 닫기",
        collapseSidebar: "사이드 탐색 접기",
        expandSidebar: "사이드 탐색 펼치기",
        accountMenuLabel: "계정 작업",
        openAccountMenu: "{name} 계정 메뉴 열기",
        closeAccountMenu: "{name} 계정 메뉴 닫기",
      },
      reservationManagement: reservationManagementCopy.ko,
      zaad: zaadDictionaries.ko,
      userListTitle: "사용자 관리",
      searchPlaceholder: "이름 또는 이메일로 검색",
      search: "검색",
      clear: "초기화",
      createUserTitle: "관리자 사용자 생성",
      createUserDescription:
        "첫 로그인용 임시 비밀번호를 발급하고 첫 로그인 후 변경을 강제합니다.",
      createUser: "사용자 생성",
      email: "이메일 주소",
      name: "이름",
      role: "권한",
      mustChangePassword: "비밀번호 변경 필요",
      createdAt: "생성 일시",
      status: "상태",
      requestedAt: "신청 일시",
      reviewedAt: "확인 일시",
      approve: "승인",
      reject: "거절",
      pending: "대기 중",
      approved: "승인됨",
      rejected: "거절됨",
      consumed: "변경됨",
      noUsers: "해당 사용자가 없습니다.",
      noResetRequests: "비밀번호 재설정 신청이 없습니다.",
      page: "페이지",
      paginationLabel: "사용자 목록 페이지",
      previous: "이전",
      next: "다음",
      issuedPasswordTitle: "임시 비밀번호를 발급했습니다",
      issuedPasswordDescription:
        "이 화면을 닫으면 다시 표시할 수 없습니다. 공유 후 사용자에게 로그인과 변경을 요청하세요.",
      adminOnly: "관리자만 접근할 수 있습니다.",
      myPage: {
        title: "마이 페이지",
        description: "로그인한 계정 정보를 확인할 수 있습니다.",
        name: "이름",
        email: "이메일 주소",
        noAccess: "현재 사용할 수 있는 관리 기능이 없습니다. 접근 권한이 필요하면 관리자에게 문의하세요.",
        denied: "이 페이지에 접근할 권한이 없습니다.",
      },
      accessControl: {
        rolesNav: "역할",
        listTitle: "역할",
        listDescription:
          "각 역할로 관리 페이지 접근을 제어합니다. 명시적 거부가 허용보다 우선합니다.",
        roleCount: "개 역할",
        addRole: "역할 추가",
        createTitle: "역할 추가",
        createDescription:
          "역할 이름과 설명을 입력합니다. 모든 관리 페이지 권한은 선택되지 않은 상태로 생성됩니다.",
        roleName: "역할 이름",
        roleNameRequired: "역할 이름을 입력하세요.",
        roleNameTooLong: "역할 이름은 64자 이내로 입력하세요.",
        roleDescription: "설명",
        descriptionOptional: "설명(선택)",
        memberCount: "멤버 수",
        actions: "작업",
        edit: "편집",
        editRoleTitle: "역할 편집",
        editRoleDescription: "역할 이름과 설명을 편집합니다.",
        systemRole: "시스템 역할",
        systemRoleReadOnly: "시스템 역할은 변경할 수 없습니다.",
        noRoles: "역할이 없습니다.",
        cancel: "취소",
        add: "추가",
        saving: "저장 중…",
        save: "저장",
        saved: "역할 설정을 저장했습니다.",
        reload: "최신 정보 다시 불러오기",
        deleteRole: "역할 삭제",
        backToRoles: "역할 목록으로",
        backToUserDetails: "사용자 상세로 돌아가기",
        settingsTab: "역할 설정",
        membersTab: "역할 멤버",
        adminPageAccessTitle: "관리 페이지 접근 권한",
        adminPageAccessDescription:
          "보기를 해제하면 같은 페이지의 추가, 편집, 삭제도 허용되지 않습니다.",
        adminPageColumn: "관리 페이지",
        allow: "허용",
        deny: "거부",
        unset: "미설정",
        unsupported: "해당 없음",
        path: "경로",
        targetPaths: "대상 경로",
        assignedRoles: "할당된 역할",
        noAssignedRoles: "할당된 역할이 없습니다.",
        effectiveAccess: "유효 접근 권한",
        userAccessPageTitle: "사용자 접근 권한 | 미래시 관리 화면",
        userAccessTitle: "사용자 유효 접근 권한",
        userAccessHeading: "{name}의 접근 권한",
        userAccessDescription:
          "할당된 역할과 관리자 추가 조건을 반영한 최종 결과입니다.",
        viewAccess: "접근 권한 확인",
        allowed: "허용",
        denied: "거부",
        genericError: "역할을 처리할 수 없습니다.",
        conflictError: "다른 변경과 충돌했습니다. 새로고침 후 다시 시도하세요.",
        duplicateError: "같은 이름의 역할이 이미 있습니다.",
        listSearchPlaceholder: "역할 이름 또는 ID로 검색",
        memberSearchPlaceholder: "이름, 이메일 또는 ID로 멤버 검색",
        candidateSearchPlaceholder: "이름, 이메일 또는 ID로 추가할 사용자 검색",
        assignUsers: "사용자 추가",
        assign: "할당",
        removeAssignment: "할당 해제",
        noMembers: "이 역할에 할당된 사용자가 없습니다.",
        noCandidates: "추가할 수 있는 사용자가 없습니다.",
        candidateDialogTitle: "역할 멤버 추가",
        candidateDialogDescription:
          "선택한 사용자의 현재 접근 역할을 변경합니다.",
        deleteRoleTitle: "이 역할을 삭제할까요?",
        deleteRoleDescription:
          "역할과 권한 설정이 영구적으로 삭제되며 되돌릴 수 없습니다.",
        roleInUse: "이 역할을 삭제하기 전에 모든 멤버 할당을 해제하세요.",
        readOnlyRoleAction: "이 작업을 수행할 권한이 없습니다.",
        adminAttributeHelp: "관리 사용자 작업의 추가 조건으로 사용합니다.",
        assignedRolesHelp:
          "관리 페이지별 보기, 추가, 편집, 삭제 권한을 결정합니다. 사용자는 하나의 역할만 가집니다.",
        accessRoleSummaryHelp:
          "관리 페이지별 보기, 추가, 편집, 삭제 권한을 결정합니다.",
        replaceAccessRoleHelp:
          "저장하면 현재 접근 역할을 선택한 역할로 변경합니다.",
        loading: "로딩 중…",
        accountSuspended: "이 사용자가 정지되어 모든 접근이 거부됩니다.",
        passwordChangeRequired:
          "초기 비밀번호 변경을 완료할 때까지 모든 접근이 거부됩니다.",
        systemRoleNames: { FULL_ACCESS: "전체 접근", NO_ACCESS: "접근 없음" },
        systemRoleDescriptions: {
          FULL_ACCESS: "지원되는 모든 관리 작업을 허용합니다.",
          NO_ACCESS:
            "권한을 부여하지 않으므로 모든 작업이 암시적으로 거부됩니다.",
        },
        resourceTitles: {
          users: "관리 사용자",
          "password-reset-requests": "비밀번호 재설정 신청",
          roles: "역할 관리",
          "role-assignments": "역할 멤버",
          "phone-settings": "전화 설정",
          "chat-settings": "AI 채팅 설정",
          "language-settings": "언어 설정",
          "maintenance-settings": "점검 설정",
          "developer-api": "Developer API",
          reservations: "예약 시스템",
          zaad: "AutoReach",
        },
        resourceDescriptions: {
          users:
            "관리 사용자 목록, 상세, 생성, 권한, 상태, 비밀번호 및 접근 요약을 관리합니다.",
          "password-reset-requests": "신청 조회, 승인, 거절을 관리합니다.",
          roles: "접근 역할, 설명, 권한을 관리합니다.",
          "role-assignments": "사용자의 단일 접근 역할을 조회하고 변경합니다.",
          "phone-settings": "대표 전화번호와 AI 전화번호를 관리합니다.",
          "chat-settings": "Web Chat 모드와 연결 설정을 관리합니다.",
          "language-settings": "공개 사이트 언어와 표시 순서를 관리합니다.",
          "maintenance-settings": "환경별 모드와 일정을 관리합니다.",
          "developer-api": "외부 연동용 API 및 Webhook 인증 정보를 관리합니다.",
          reservations:
            "지방자치단체 업무의 예약 현황을 보고 데모 예약을 생성합니다.",
          zaad: "방재 행정 무선 주민, 발신 메시지, 연락처 목록 및 캠페인을 관리합니다.",
        },
        actionLabels: {
          VIEW: "보기",
          CREATE: "추가",
          UPDATE: "편집",
          DELETE: "삭제",
        },
      },
      userManagement: {
        detailsPageTitle: "사용자 상세 | 미래시 관리 화면",
        detailsTitle: "사용자 상세 정보",
        detailsDescription:
          "사용자 정보, 권한, 접근 역할 및 비밀번호를 관리합니다.",
        detailsReadOnly:
          "사용자 정보를 볼 수 있습니다. 변경하려면 사용자 편집 권한이 필요합니다.",
        name: "이름",
        accessRoles: "접근 역할",
        backToUsers: "사용자 관리로 돌아가기",
        settings: "설정",
        actionsFor: "설정 대상",
        edit: "편집",
        suspend: "정지",
        reactivate: "재활성화",
        delete: "삭제",
        active: "활성",
        suspended: "정지됨",
        save: "저장",
        saving: "저장 중…",
        cancel: "취소",
        saved: "변경 사항을 저장했습니다.",
        password: "비밀번호",
        resetPassword: "재설정",
        passwordConfigured: "설정됨",
        passwordChangeRequired: "다음 로그인 후 변경 필요",
        passwordVisibilityHelp: "다른 사용자의 비밀번호는 표시할 수 없습니다.",
        selfPasswordResetProtected:
          "자신의 비밀번호는 비밀번호 변경 화면에서 변경하세요.",
        passwordMode: "비밀번호 유형",
        temporaryPasswordMode: "임시 비밀번호",
        temporaryPasswordModeDescription:
          "다음 로그인 후 사용자가 직접 변경해야 합니다.",
        standardPasswordMode: "일반 비밀번호",
        standardPasswordModeDescription:
          "관리자가 설정한 비밀번호를 그대로 사용할 수 있습니다.",
        newPassword: "새 비밀번호",
        confirmPassword: "새 비밀번호 확인",
        passwordsMatch: "비밀번호가 일치합니다.",
        passwordRequirements: "12자 이상 128자 이하로 입력하세요.",
        generateTemporaryPassword: "임시 비밀번호 자동 생성",
        revokeSessions: "변경 후 강제 로그아웃",
        revokeSessionsDescription:
          "활성화하면 이 사용자의 모든 로그인 세션을 종료합니다.",
        enabled: "사용",
        disabled: "사용 안 함",
        passwordDialogTitle: "비밀번호를 재설정하시겠습니까?",
        passwordDialogDescription:
          "설정을 확인한 후 비밀번호를 재설정하세요. 이전 비밀번호는 더 이상 사용할 수 없습니다.",
        confirmPasswordReset: "비밀번호 재설정",
        passwordResetSaved: "비밀번호를 재설정했습니다.",
        selfProtected: "자신의 계정에는 이 작업을 수행할 수 없습니다.",
        lastAdminProtected:
          "마지막 활성 관리자에게는 이 작업을 수행할 수 없습니다.",
        emailDialogTitle: "이메일 주소를 변경하시겠습니까?",
        emailDialogDescription:
          "변경 후에는 새 이메일 주소로 로그인합니다. 내용을 확인한 후 변경하세요.",
        currentEmail: "현재 이메일 주소",
        newEmail: "새 이메일 주소",
        changeEmail: "이메일 주소 변경",
        suspendDialogTitle: "사용자를 정지하시겠습니까?",
        suspendDialogDescription:
          "사용자의 현재 세션이 종료되며 재활성화할 때까지 로그인할 수 없습니다.",
        reactivateDialogTitle: "사용자를 재활성화하시겠습니까?",
        reactivateDialogDescription:
          "정지를 해제하고 이 사용자가 다시 로그인할 수 있도록 합니다.",
        deleteDialogTitle: "사용자를 삭제하시겠습니까?",
        deleteDialogDescription:
          "사용자와 인증 정보가 영구적으로 삭제됩니다. 이 작업은 취소할 수 없습니다.",
        targetUser: "대상 사용자",
        errors: {
          AUTHENTICATION_REQUIRED: "로그인이 필요합니다.",
          ADMINISTRATOR_REQUIRED: "관리자 권한이 필요합니다.",
          PASSWORD_CHANGE_REQUIRED: "먼저 비밀번호를 변경하세요.",
          INVALID_REQUEST: "요청 내용이 올바르지 않습니다.",
          INVALID_NAME: "이름을 입력하세요.",
          INVALID_EMAIL: "유효한 이메일 주소를 입력하세요.",
          EMAIL_ALREADY_EXISTS: "이 이메일 주소는 이미 사용 중입니다.",
          INVALID_ROLE: "유효한 권한을 선택하세요.",
          INVALID_PASSWORD: "비밀번호를 12자 이상 128자 이하로 입력하세요.",
          PASSWORD_MISMATCH: "확인 비밀번호가 일치하지 않습니다.",
          USER_NOT_FOUND: "대상 사용자를 찾을 수 없습니다.",
          SELF_PROTECTED: "자신의 계정에는 이 작업을 수행할 수 없습니다.",
          LAST_ACTIVE_ADMIN:
            "마지막 활성 관리자에게는 이 작업을 수행할 수 없습니다.",
          UPDATE_FAILED: "사용자 정보를 업데이트할 수 없습니다.",
          SUSPEND_FAILED: "사용자를 정지할 수 없습니다.",
          REACTIVATE_FAILED: "사용자를 재활성화할 수 없습니다.",
          DELETE_FAILED: "사용자를 삭제할 수 없습니다.",
          RESET_PASSWORD_FAILED: "비밀번호를 재설정할 수 없습니다.",
          SESSION_REVOCATION_FAILED:
            "비밀번호는 변경되었지만 로그인 세션을 종료할 수 없습니다.",
        },
      },
      settings: {
        save: "설정 저장",
        saving: "저장 중…",
        saved: "설정을 저장했습니다.",
        saveError: "설정을 저장할 수 없습니다.",
        pageSaveScope: "이 페이지의 모든 탭 설정을 저장합니다.",
        sectionSaveScope: "이 섹션의 설정을 저장합니다.",
        errors: {
          AUTHENTICATION_REQUIRED: "로그인이 필요합니다.",
          ADMINISTRATOR_REQUIRED: "관리자 권한이 필요합니다.",
          PASSWORD_CHANGE_REQUIRED:
            "설정을 변경하기 전에 비밀번호를 변경해 주세요.",
          INVALID_REQUEST: "입력 내용을 확인해 주세요.",
          INVALID_REPRESENTATIVE_PHONE_DISPLAY:
            "대표 전화번호 표시값에 지원되지 않는 문자가 포함되어 있습니다.",
          INVALID_REPRESENTATIVE_PHONE_E164:
            "대표 전화 발신 번호를 E.164 형식으로 입력해 주세요.",
          INVALID_AI_PHONE_E164: "AI 전화번호를 E.164 형식으로 입력해 주세요.",
          INVALID_ZOOM_CAMPAIGN_WEB_TAG:
            "Campaign 필드에 Zoom Campaign 설정에서 발급한 유효한 Web Tag를 입력해 주세요.",
          INVALID_ZOOM_CONTACT_CENTER_WEB_TAG:
            "Contact Center Entry ID 필드에 data-chat-entry-id가 포함된 유효한 Web Tag를 입력해 주세요.",
          ACTIVE_ZOOM_CHAT_TAG_REQUIRED:
            "선택한 채팅 방식의 Web Tag를 입력해 주세요.",
          INVALID_CHAT_MEMO: "관리 메모는 4,000자 이내로 입력해 주세요.",
          INVALID_LANGUAGE_SETTINGS:
            "5개 언어를 중복 없이 한 번씩 지정해 주세요.",
          JAPANESE_REQUIRED: "일본어는 비활성화할 수 없습니다.",
          SETTINGS_SAVE_FAILED: "설정을 저장할 수 없습니다.",
        },
      },
      phoneManagement: {
        title: "전화 관리",
        description:
          "대표 전화와 공개 사이트의 각 언어에서 사용할 AI 전화 상담 번호를 설정합니다.",
        representativeTitle: "대표 전화",
        representativeDescription:
          "공통 푸터에 표시할 전화번호와 발신에 사용할 번호를 설정합니다.",
        representativeDisplayLabel: "표시용 전화번호",
        representativeDisplayHelp: "예: (03)1234-5678",
        representativeE164Label: "발신 전화번호(E.164)",
        representativeE164Help: "예: +81312345678",
        aiPhoneTitle: "AI 전화 상담",
        aiPhoneDescription:
          "공개 사이트에서 선택한 언어에 따라 발신할 번호를 설정합니다. 빈칸은 미설정으로 저장됩니다.",
        aiPhoneLabel: "AI 전화번호(E.164)",
        hidden: "숨김",
      },
      developerApiManagement: {
        title: "Developer API",
        description:
          "외부 연동에 사용할 인증 정보와 Webhook Secret Token을 설정합니다.",
        oauthTitle: "Server To Server OAuth",
        oauthDescription: "Zoom API 연결에 사용할 인증 정보를 설정합니다.",
        webhookTitle: "Webhook Only app",
        webhookDescription: "Webhook 검증에 사용할 Secret Token을 설정합니다.",
        accountId: "Account ID",
        clientId: "Client ID",
        clientSecret: "Client Secret",
        secretToken: "Secret Token",
        errors: {
          DEVELOPER_API_INVALID_REQUEST: "입력 내용을 확인하세요.",
          DEVELOPER_API_INVALID_ACCOUNT_ID:
            "Account ID는 1~255자로 입력하세요.",
          DEVELOPER_API_INVALID_CLIENT_ID: "Client ID는 1~255자로 입력하세요.",
          DEVELOPER_API_OAUTH_SECRET_REQUIRED:
            "Server-To-Server OAuth 최초 저장 시 Client Secret이 필요합니다.",
          DEVELOPER_API_WEBHOOK_SECRET_REQUIRED:
            "Webhook only app 최초 저장 시 Secret Token이 필요합니다.",
          DEVELOPER_API_ENCRYPTION_UNAVAILABLE:
            "암호화 설정을 사용할 수 없어 저장할 수 없습니다.",
          DEVELOPER_API_SECRET_NOT_CONFIGURED:
            "표시할 수 있는 Secret이 설정되어 있지 않습니다.",
          DEVELOPER_API_SECRET_REVEAL_FAILED: "Secret을 표시할 수 없습니다.",
          DEVELOPER_API_SAVE_FAILED: "Developer API 설정을 저장할 수 없습니다.",
        },
      },
      chatManagement: {
        title: "AI 채팅 관리",
        description:
          "공개 사이트에서 사용할 Zoom 채팅 방식과 각 방식의 Web Tag를 설정합니다. 선택하지 않은 방식의 설정도 유지됩니다.",
        methodTab: "사용 방식",
        campaignTab: "캠페인",
        activeModeTitle: "공개 사이트에서 사용할 방식",
        activeModeDescription:
          "한 가지 방식을 선택하세요. 방식을 전환해도 저장된 Campaign 및 Entry ID 값은 삭제되지 않습니다.",
        active: "사용 중",
        inactive: "사용 안 함",
        modes: {
          disabled: {
            label: "사용하지 않음",
            description:
              "공개 사이트에서 Zoom 채팅 SDK를 로드하지 않습니다. 저장된 태그는 유지됩니다.",
          },
          campaign: {
            label: "Campaign",
            description:
              "Zoom Campaign에 설정된 대상 URL 및 노출 조건에 따라 채팅을 표시합니다.",
          },
          contactCenterEntryId: {
            label: "Contact Center Entry ID",
            description:
              "지정한 Contact Center 플로의 Entry ID를 사용해 채팅을 시작합니다.",
          },
        },
        campaign: {
          title: "Campaign",
          description:
            "Zoom 관리 화면의 Contact Center Management > Campaigns > Embed Web Tag에서 복사한 태그를 붙여 넣으세요.",
          webTagLabel: "Campaign Web Tag(Embed Web Tag)",
          webTagHelp:
            "전체 script 태그를 붙여 넣으세요. 이 필드에서는 data-chat-entry-id가 포함된 태그를 사용할 수 없습니다.",
          memoLabel: "Campaign 메모(선택 사항)",
          memoHelp:
            "관리자용 내부 메모입니다. 공개 사이트에 표시되거나 동작에 사용되지 않습니다(최대 4,000자).",
        },
        contactCenterEntryId: {
          title: "Contact Center Entry ID",
          description:
            "대상 플로의 Start > Manage Entry Point > Import SDK에서 복사한 태그를 붙여 넣으세요.",
          webTagLabel: "Contact Center Web Tag(Import SDK)",
          webTagHelp:
            "전체 script 태그를 붙여 넣으세요. 이 필드의 태그에는 data-chat-entry-id가 필요합니다.",
          memoLabel: "Contact Center 메모(선택 사항)",
          memoHelp:
            "관리자용 내부 메모입니다. 공개 사이트에 표시되거나 동작에 사용되지 않습니다(최대 4,000자).",
        },
      },
      languageManagement: {
        title: "언어 관리",
        description:
          "공개 사이트 언어 메뉴에 표시할 언어와 정렬 순서를 설정합니다.",
        enabledCountLabel: "표시 언어 수",
        japaneseRequired: "필수",
        moveUp: "위로",
        moveDown: "아래로",
      },
      maintenanceManagement: {
        title: "점검 관리",
        description:
          "공개 사이트를 정상 공개, 즉시 점검 또는 예약 점검으로 설정합니다.",
        environmentLabel: "대상 환경",
        environments: {
          production: "프로덕션",
          preview: "프리뷰",
          development: "개발",
        },
        effectiveStateTitle: "현재 적용 상태",
        effectiveActive: "점검 중",
        effectiveInactive: "정상 공개 중",
        effectiveUnknown: "확인할 수 없음",
        currentValueUnavailableTitle: "현재 설정을 불러올 수 없습니다",
        currentValueUnavailableDescription:
          "의도하지 않은 공개 상태 변경을 방지하기 위해 입력과 저장을 비활성화했습니다. 잠시 후 페이지를 새로고침하세요.",
        modeTitle: "공개 모드",
        modeDescription: "공개 사이트에 적용할 모드를 하나 선택하세요.",
        modes: {
          disabled: {
            label: "정상 공개",
            description: "공개 사이트의 일반 콘텐츠를 표시합니다.",
          },
          enabled: {
            label: "지금 점검 시작",
            description: "저장 후 공개 사이트를 점검 화면으로 전환합니다.",
          },
          scheduled: {
            label: "일시 예약",
            description:
              "지정한 시작 시각부터 종료 시각까지 점검 화면을 표시합니다.",
          },
        },
        scheduleTitle: "예약 일시",
        scheduleDescription:
          "예약 점검을 선택한 경우 사용합니다. 다른 모드로 전환해도 저장된 시각은 유지됩니다.",
        scheduledStartLabel: "시작 날짜 및 시간(JST)",
        scheduledEndLabel: "종료 날짜 및 시간(JST)",
        timeZoneNote: "날짜와 시간은 일본 표준시(JST)로 입력하세요.",
        scheduleRequired: "시작 날짜 및 시간과 종료 날짜 및 시간을 입력하세요.",
        scheduleOrderError: "종료 날짜 및 시간은 시작보다 이후여야 합니다.",
        scheduleEndFutureError: "종료 날짜 및 시간은 현재보다 이후여야 합니다.",
        conflictError:
          "다른 관리자가 설정을 업데이트했습니다. 입력한 내용은 유지됩니다. 페이지를 새로고침하여 최신 설정을 확인한 후 다시 저장하세요.",
        warningTitle: "공개 사이트 표시가 전환됩니다",
        warningDescription:
          "점검 중에는 공개 사이트의 일반 콘텐츠, 헤더, 푸터 및 AI 채팅을 사용할 수 없습니다. 관리 및 인증 화면은 계속 사용할 수 있습니다.",
        propagationNote: "저장한 설정은 다음 네트워크 요청부터 적용됩니다.",
        updatedAtLabel: "마지막 업데이트",
      },
    },
  },
};
