import type { Purpose, Template, Outcome } from "./contracts";
// University demo fixtures. These are invented records, not student data or measured outcomes.
export const DEMO_DATE = "2026-09-10";
export const GENERIC_VOICEMAIL =
  "未来大学からご案内があります。大学のポータルをご確認ください。ご不明な点は、大学の公式サイトに掲載された窓口へお問い合わせください。";
export const CASES: Template[] = [
  {
    id: "admissions",
    number: "01",
    name: "入学手続きフォロー",
    icon: "CalendarMonthIcon",
    audience: "締切が近い手続き未完了者",
    trigger: "ポータル・メールで案内済みの未回答者へ、締切前に連絡",
    mode: "follow-up",
    purpose: "手続き予定と困りごとを把握し、相談希望者を入試課の対応につなぐ。",
    fields: [
      ["procedure", "手続き", "入学手続き"],
      ["deadline", "手続き期限", "2026-09-15", "date"],
      [
        "noticeReference",
        "本人向け案内",
        "大学ポータル「入学手続きのお知らせ」",
      ],
    ],
    questions: [
      ["plannedDate", "いつごろ手続きを進める予定ですか？", "予定日 / 未定"],
      [
        "difficulty",
        "書類や操作でお困りのことはありますか？",
        "なし / 書類 / 操作 / その他 / 回答しない",
      ],
      ["consultation", "職員への相談を希望しますか？", "希望する / 希望しない"],
    ],
    answerColumns: [
      ["plannedDate", "手続き予定"],
      ["difficulty", "困りごと"],
      ["consultation", "相談希望"],
    ],
    completion:
      "相談・案内を職員が実施し、入試担当が手続きシステムで完了を確認する。予定の回答だけでは手続き完了にしない。",
    evidence: "入試担当者による確認日・確認先の記録",
    procedureApplicable: true,
  },
  {
    id: "scholarship",
    number: "02",
    name: "奨学金・授業料減免の手続き支援",
    icon: "GroupIcon",
    audience: "通常の通知に反応がない、継続申請・不足書類の対象学生",
    trigger: "ポータル・メールの通常通知後、期限が近い未回答者へ連絡",
    mode: "follow-up",
    purpose:
      "失念と手続きの困りごとを区別し、希望に応じて相談や案内の再送につなぐ。",
    fields: [
      ["procedure", "手続き", "奨学金の継続手続き"],
      ["deadline", "提出期限", "2026-09-15", "date"],
      [
        "noticeReference",
        "本人向け案内",
        "大学ポータル「継続手続きのお知らせ」",
      ],
    ],
    questions: [
      [
        "noticeSeen",
        "大学からの案内をご確認いただけましたか？",
        "確認した / 未確認 / 再送希望",
      ],
      ["plannedDate", "いつごろ提出する予定ですか？", "予定日 / 未定"],
      [
        "difficulty",
        "手続きを進めるうえでお困りのことはありますか？",
        "失念 / 書類・操作 / 案内がわからない / なし / 回答しない",
      ],
      [
        "consultation",
        "職員への相談や案内の再送を希望しますか？",
        "相談希望 / 再送希望 / 両方 / 希望なし",
      ],
    ],
    answerColumns: [
      ["plannedDate", "提出予定"],
      ["difficulty", "理由"],
      ["consultation", "相談希望"],
      ["resend", "再送希望"],
    ],
    completion:
      "相談・再送を職員が実施し、提出状況は担当者が学内の手続きシステムで確認する。経済状況や支給額は電話で収集しない。",
    evidence: "相談・再送の実施記録と、提出確認日",
    procedureApplicable: true,
  },
  {
    id: "staff",
    number: "03",
    name: "試験監督・運営スタッフの参集確認",
    icon: "GroupIcon",
    audience: "試験監督・運営スタッフ",
    trigger: "試験当日の参集確認、または会場変更時に直接連絡",
    mode: "direct",
    purpose:
      "参加・到着予定と会場確認を集め、配置可能人数と不足会場を把握する。",
    fields: [
      ["event", "対象の試験", "秋季入学試験"],
      ["arrivalDeadline", "集合時刻", "09:00", "time"],
      ["venueA", "A会場の必要人数", "3", "number"],
      ["venueB", "B会場の必要人数", "2", "number"],
    ],
    questions: [
      [
        "participation",
        "本日の運営に参加できますか？",
        "参加可能 / 参加不可 / 未定",
      ],
      ["arrival", "何時ごろ到着予定ですか？", "時刻 / 未定"],
      [
        "venueConfirmed",
        "指定された会場・会場変更を確認しましたか？",
        "確認した / 未確認",
      ],
    ],
    answerColumns: [
      ["venue", "配置会場"],
      ["participation", "参加可否"],
      ["arrival", "到着予定"],
      ["venueConfirmed", "会場確認"],
    ],
    completion:
      "担当者が配置可能人数を確認し、不足会場の代替要員を確保して記録する。参加予定と実際の到着は区別する。",
    evidence: "会場ごとの配置確認と代替要員の確保記録",
    procedureApplicable: false,
  },
  {
    id: "class-change",
    number: "04",
    name: "休講・試験会場変更の確認",
    icon: "CalendarMonthIcon",
    audience: "変更対象の授業・試験の受講者",
    trigger: "急な変更が決まった際、対象の受講者へ直接連絡",
    mode: "direct",
    purpose:
      "案内を確認していない学生と、新会場への移動に支援が必要な学生を把握する。",
    fields: [
      ["event", "対象の授業・試験", "基礎統計学 期末試験"],
      ["oldRoom", "変更前", "A棟 201教室"],
      ["newRoom", "変更後", "B棟 101教室"],
      ["effectiveAt", "実施日時", "2026-09-15T10:00", "datetime-local"],
    ],
    questions: [
      ["changeSeen", "変更の案内を確認しましたか？", "確認した / 未確認"],
      ["canMove", "新しい会場へ移動できますか？", "移動できる / 難しい / 不明"],
      ["support", "職員の支援を希望しますか？", "希望する / 希望しない"],
    ],
    answerColumns: [
      ["changeSeen", "変更確認"],
      ["canMove", "移動可否"],
      ["support", "支援希望"],
    ],
    completion:
      "未確認者への再連絡と、支援希望者への教務課の対応結果を記録する。通話接続だけで周知完了にしない。",
    evidence: "案内の確認と支援実施の記録",
    procedureApplicable: false,
  },
  {
    id: "facility",
    number: "05",
    name: "学生寮・設備トラブル対応",
    icon: "SettingsIcon",
    audience: "断水・停電等の影響を受ける学生・施設利用者",
    trigger: "設備障害の発生後の状況確認、または夜間の故障受付",
    mode: "direct",
    purpose: "影響範囲を集約し、施設担当者・委託業者へ必要な情報を引き継ぐ。",
    fields: [
      ["incident", "トラブル", "学生寮の断水"],
      ["building", "対象建物", "北寮・南寮"],
      ["incidentAt", "発生日時", "2026-09-10T20:00", "datetime-local"],
    ],
    questions: [
      ["affected", "影響を受けていますか？", "影響あり / 影響なし / 不明"],
      ["buildingRoom", "建物と部屋を教えてください。", "建物・部屋 / 不明"],
      [
        "situation",
        "現在の状況と、希望する対応を教えてください。",
        "状況 / 対応希望 / 折り返し希望",
      ],
    ],
    answerColumns: [
      ["affected", "影響"],
      ["buildingRoom", "建物・部屋"],
      ["situation", "状況"],
      ["support", "対応希望"],
    ],
    completion:
      "施設担当者または委託業者の受領・対応結果を職員が記録し、復旧または利用者への案内を確認する。",
    evidence: "担当への引継ぎ記録と復旧・案内の確認日",
    procedureApplicable: false,
  },
  {
    id: "group",
    number: "06",
    name: "実習・留学・課外活動の状況確認",
    icon: "GroupIcon",
    audience: "引率者・グループ代表者",
    trigger: "通常案内後の未回答グループ、または集合変更等の直接確認",
    mode: "follow-up",
    purpose:
      "代表者からグループの状況を集め、集合遅れと支援の必要性を把握する。",
    fields: [
      ["activity", "対象の活動", "学外実習・国際交流プログラム"],
      ["deadline", "回答期限", "2026-09-15", "date"],
      ["timeZone", "集計時刻の基準", "Asia/Tokyo"],
    ],
    questions: [
      [
        "assembled",
        "グループのうち何人が集合していますか？",
        "集合人数（0以上）",
      ],
      ["delayed", "遅れている人は何人ですか？", "遅延人数（0以上）"],
      ["location", "現在地と支援の必要性を教えてください。", "場所 / 支援要否"],
    ],
    answerColumns: [
      ["memberCount", "対象人数"],
      ["assembled", "集合"],
      ["delayed", "遅延"],
      ["location", "現在地"],
      ["support", "支援希望"],
    ],
    completion:
      "各グループの最新回答を確認し、支援を希望するグループへ担当部署が対応したことを記録する。",
    evidence: "グループ別の最新状況と支援記録",
    procedureApplicable: false,
  },
  {
    id: "continuity",
    number: "07",
    name: "学修継続の相談案内",
    icon: "ChatIcon",
    audience: "職員が選定した、連絡が取れていない学生",
    trigger: "職員の選定後、通常案内に反応がない学生へ連絡",
    mode: "follow-up",
    purpose: "相談・折り返しを希望する学生を、職員による相談につなぐ。",
    fields: [
      [
        "noticeReference",
        "本人向け案内",
        "大学ポータル「学生支援窓口のご案内」",
      ],
      ["callbackWindow", "折り返し可能な時間帯", "平日 9:00〜17:00"],
    ],
    questions: [
      ["noticeSeen", "大学からの案内を確認しましたか？", "確認した / 未確認"],
      [
        "consultation",
        "職員への相談を希望しますか？",
        "希望する / 希望しない / 今は回答しない",
      ],
      [
        "callback",
        "折り返しを希望しますか？",
        "希望する / 希望しない / 希望時間帯",
      ],
    ],
    answerColumns: [
      ["noticeSeen", "案内確認"],
      ["consultation", "相談希望"],
      ["callback", "折り返し希望"],
    ],
    completion:
      "本人が希望する相談・折り返しを職員が実施し結果を記録する。応答しないことや相談辞退をリスク判定に使わない。",
    evidence: "職員による相談または折り返しの実施記録",
    procedureApplicable: false,
  },
];

export const CALL_LABELS = {
  HUMAN: "通話接続",
  VOICEMAIL: "留守番電話",
  NO_ANSWER: "未回答",
  BUSY: "話中",
  FAILED: "発信失敗",
  NOT_CALLED: "未発信",
};
export const RESULT_LABELS = {
  planned: "手続き予定",
  consultation: "相談希望",
  resend: "再送希望",
  unconfirmed: "未回答・未確認",
  confirmed: "確認済み",
  support: "支援希望",
  available: "参加可能",
  unavailable: "参加不可",
  affected: "影響あり",
  group: "グループ回答",
  declined: "相談辞退",
};
export const TASK_LABELS = {
  OPEN: "未着手",
  IN_PROGRESS: "対応中",
  RESOLVED: "対応完了",
  CLOSED_UNREACHED: "連絡不能で終了",
};
export const PROCEDURE_LABELS = {
  UNKNOWN: "未確認",
  PLANNED: "手続き予定",
  VERIFIED: "担当者が完了確認",
  NA: "対象外",
};

const person = (n: number, overrides: Partial<Outcome> = {}): Outcome => ({
  id: `student-${String(n).padStart(3, "0")}`,
  name: `学生デモ${String(n).padStart(2, "0")}`,
  maskedContact: `連絡先登録済み • ${String(n).padStart(4, "0")}`,
  contactKey: `demo-contact-${n}`,
  eligible: true,
  exclusionReason: "",
  priorNoticeAt: "2026-09-08",
  notified: true,
  selectedByStaff: true,
  groupMemberCount: 1,
  call: "HUMAN",
  recognized: true,
  confirmed: true,
  answers: {},
  ...overrides,
});

export function recipientsFor(id: Purpose): Outcome[] {
  if (id === "scholarship")
    return [
      person(1, {
        answers: {
          noticeSeen: "確認した",
          plannedDate: "2026-09-12",
          difficulty: "失念",
          consultation: false,
          resend: false,
        },
      }),
      person(2, {
        answers: {
          noticeSeen: "確認した",
          plannedDate: "2026-09-14",
          difficulty: "なし",
          consultation: false,
          resend: false,
        },
      }),
      person(3, {
        answers: {
          noticeSeen: "確認した",
          plannedDate: "未定",
          difficulty: "書類・操作",
          consultation: true,
          resend: false,
        },
      }),
      person(4, {
        answers: {
          noticeSeen: "再送希望",
          plannedDate: "未定",
          difficulty: "案内がわからない",
          consultation: false,
          resend: true,
        },
      }),
      person(5, { call: "NO_ANSWER", recognized: false, confirmed: false }),
      person(6, { call: "VOICEMAIL", recognized: false, confirmed: false }),
      person(7, { recognized: false, confirmed: false }),
      person(8, { call: "BUSY", recognized: false, confirmed: false }),
      person(9, { eligible: false, exclusionReason: "手続き完了を確認済み" }),
      person(10, { eligible: false, exclusionReason: "電話連絡の対象外" }),
    ];
  if (id === "staff")
    return [
      person(1, {
        name: "運営スタッフ01",
        answers: {
          venue: "A会場",
          participation: "参加可能",
          arrival: "08:40",
          venueConfirmed: true,
        },
      }),
      person(2, {
        name: "運営スタッフ02",
        answers: {
          venue: "A会場",
          participation: "参加可能",
          arrival: "08:50",
          venueConfirmed: true,
        },
      }),
      person(3, {
        name: "運営スタッフ03",
        answers: {
          venue: "B会場",
          participation: "参加可能",
          arrival: "08:45",
          venueConfirmed: true,
        },
      }),
      person(4, {
        name: "運営スタッフ04",
        answers: {
          venue: "B会場",
          participation: "参加可能",
          arrival: "09:20",
          venueConfirmed: true,
        },
      }),
      person(5, {
        name: "運営スタッフ05",
        answers: {
          venue: "A会場",
          participation: "参加不可",
          arrival: "未定",
          venueConfirmed: true,
        },
      }),
      person(6, {
        name: "運営スタッフ06",
        call: "NO_ANSWER",
        confirmed: false,
        recognized: false,
        answers: { venue: "B会場" },
      }),
    ];
  if (id === "group")
    return [
      person(1, {
        name: "看護実習 A班（引率者）",
        groupMemberCount: 12,
        answers: {
          memberCount: 12,
          assembled: 11,
          delayed: 1,
          location: "実習先の正面入口",
          support: false,
        },
      }),
      person(2, {
        name: "国際交流 B班（代表者）",
        groupMemberCount: 18,
        answers: {
          memberCount: 18,
          assembled: 16,
          delayed: 2,
          location: "現地研修先の集合場所",
          support: true,
        },
      }),
      person(3, {
        name: "課外活動 C班（代表者）",
        groupMemberCount: 10,
        answers: {
          memberCount: 10,
          assembled: 10,
          delayed: 0,
          location: "大学の集合場所",
          support: false,
        },
      }),
      person(4, {
        name: "学外実習 D班（引率者）",
        groupMemberCount: 8,
        call: "NO_ANSWER",
        recognized: false,
        confirmed: false,
      }),
    ];
  if (id === "facility")
    return [
      person(1, {
        answers: {
          affected: "影響あり",
          buildingRoom: "北寮 101",
          situation: "蛇口から水が出ない",
          support: true,
        },
      }),
      person(2, {
        answers: {
          affected: "影響あり",
          buildingRoom: "北寮 202",
          situation: "共用の洗面所も断水",
          support: true,
        },
      }),
      person(3, {
        answers: {
          affected: "影響なし",
          buildingRoom: "南寮 103",
          situation: "現在は利用可能",
          support: false,
        },
      }),
      person(4, { call: "NO_ANSWER", recognized: false, confirmed: false }),
    ];
  if (id === "class-change")
    return [
      person(1, {
        answers: {
          changeSeen: "確認した",
          canMove: "移動できる",
          support: false,
        },
      }),
      person(2, {
        answers: { changeSeen: "確認した", canMove: "難しい", support: true },
      }),
      person(3, {
        answers: { changeSeen: "未確認", canMove: "不明", support: false },
        confirmed: false,
      }),
      person(4, { call: "NO_ANSWER", recognized: false, confirmed: false }),
    ];
  if (id === "continuity")
    return [
      person(1, {
        answers: {
          noticeSeen: "確認した",
          consultation: true,
          callback: "平日15時以降",
        },
      }),
      person(2, {
        answers: {
          noticeSeen: "確認した",
          consultation: false,
          callback: "希望しない",
        },
      }),
      person(3, { call: "VOICEMAIL", recognized: false, confirmed: false }),
      person(4, { call: "NO_ANSWER", recognized: false, confirmed: false }),
    ];
  return [
    person(1, {
      answers: {
        plannedDate: "2026-09-12",
        difficulty: "なし",
        consultation: false,
      },
    }),
    person(2, {
      answers: { plannedDate: "未定", difficulty: "操作", consultation: true },
    }),
    person(3, {
      answers: { plannedDate: "未定", difficulty: "書類", consultation: true },
    }),
    person(4, { call: "NO_ANSWER", recognized: false, confirmed: false }),
  ];
}
