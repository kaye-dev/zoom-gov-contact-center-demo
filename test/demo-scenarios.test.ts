import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const scenarioRoot = path.join(
  process.cwd(),
  "docs/knowledge-base/デモシナリオ/自治体-基礎自治体-未来市",
);

const scenarioPaths = {
  voice: {
    premise: path.join(scenarioRoot, "音声-マイナポータルログイン/前提.md"),
    withoutTransfer: path.join(
      scenarioRoot,
      "音声-マイナポータルログイン/転送無し.md",
    ),
    withTransfer: path.join(
      scenarioRoot,
      "音声-マイナポータルログイン/転送あり.md",
    ),
  },
  chat: {
    premise: path.join(
      scenarioRoot,
      "チャット-粗大ごみの出し方_収集申込み/前提.md",
    ),
    withoutTransfer: path.join(
      scenarioRoot,
      "チャット-粗大ごみの出し方_収集申込み/転送無し.md",
    ),
    withTransfer: path.join(
      scenarioRoot,
      "チャット-粗大ごみの出し方_収集申込み/転送あり.md",
    ),
  },
} as const;

function localizedScenarioPaths(
  directory: "音声-マイナポータルログイン" | "チャット-粗大ごみの出し方_収集申込み",
  locale: string,
) {
  const root = path.join(scenarioRoot, directory, locale);

  return {
    premise: path.join(root, "前提.md"),
    withoutTransfer: path.join(root, "転送無し.md"),
    withTransfer: path.join(root, "転送あり.md"),
  };
}

const multilingualScenarios = [
  {
    channel: "voice",
    locale: "en",
    localeCode: "en-US",
    withoutTransferPatterns: [
      /My Number Card/iu,
      /iPhone/iu,
      /smartphone case/iu,
      /MynaPortal/iu,
    ],
    withTransferPatterns: [
      /four-digit PIN/iu,
      /three times/iu,
      /what I need to bring/iu,
      /handled today/iu,
    ],
    consentPattern: /Yes, please transfer me/iu,
    unsafeLanguagePatterns: [
      /\b(?:tell|give|enter|provide|share)\b.{0,40}\b(?:Individual Number|My Number|PIN|password)\b/iu,
    ],
    marker: "【有人担当へ転送】",
    sourceWithTransfer: scenarioPaths.voice.withTransfer,
    ...localizedScenarioPaths("音声-マイナポータルログイン", "en"),
  },
  {
    channel: "chat",
    locale: "en",
    localeCode: "en",
    withoutTransferPatterns: [
      /office chair/iu,
      /120\s*cm/iu,
      /70\s*cm/iu,
      /one office chair/iu,
      /bulky waste/iu,
      /process from applying for collection to putting it out/iu,
    ],
    withTransferPatterns: [
      /one chest of drawers/iu,
      /180\s*cm/iu,
      /120\s*cm/iu,
      /elderly mother/iu,
      /carry-out assistance/iu,
    ],
    consentPattern: /Please share these details and transfer me to a human agent/iu,
    unsafeLanguagePatterns: [
      /\b(?:booking|reservation|application)\b.{0,30}\b(?:confirmed|completed|accepted)\b/iu,
      /\b(?:confirmation|reference|receipt) number\s*(?:is|:)\s*[A-Z0-9]/iu,
      /\b(?:tell|give|enter|provide|share)\b.{0,40}\b(?:Individual Number|My Number|PIN|password)\b/iu,
    ],
    marker: "【有人チャットへ転送】",
    sourceWithTransfer: scenarioPaths.chat.withTransfer,
    ...localizedScenarioPaths("チャット-粗大ごみの出し方_収集申込み", "en"),
  },
  {
    channel: "chat",
    locale: "zh-Hans",
    localeCode: "zh-Hans",
    withoutTransferPatterns: [
      /办公椅/u,
      /120厘米/u,
      /70厘米/u,
      /1把/u,
      /大件垃圾/u,
      /从申请到投放/u,
    ],
    withTransferPatterns: [
      /一个.*衣柜/u,
      /180厘米/u,
      /120厘米/u,
      /年迈的母亲/u,
      /搬出协助/u,
    ],
    consentPattern: /请共享以上内容，并将我转接给人工客服/u,
    unsafeLanguagePatterns: [
      /(?:预约|申请)(?:已|已经)?(?:确认|完成|受理)/u,
      /(?:受理|预约)编号\s*(?:是|：|:)?\s*[A-Z0-9]/u,
      /请(?:告诉|提供|输入).{0,20}(?:个人编号|密码)/u,
    ],
    marker: "【有人チャットへ転送】",
    sourceWithTransfer: scenarioPaths.chat.withTransfer,
    ...localizedScenarioPaths(
      "チャット-粗大ごみの出し方_収集申込み",
      "zh-Hans",
    ),
  },
  {
    channel: "chat",
    locale: "ko",
    localeCode: "ko",
    withoutTransferPatterns: [
      /사무용 의자/u,
      /120cm/u,
      /70cm/u,
      /1개/u,
      /대형 폐기물/u,
      /신청부터 배출/u,
    ],
    withTransferPatterns: [
      /장롱 1개/u,
      /180cm/u,
      /120cm/u,
      /고령인 어머니/u,
      /운반 지원/u,
    ],
    consentPattern: /이 내용을 공유하고 상담원에게 연결해 주세요/u,
    unsafeLanguagePatterns: [
      /(?:예약|신청)(?:이|을|가)?\s*(?:확정|완료|접수)/u,
      /(?:접수|예약) 번호\s*(?:는|은|:)?\s*[A-Z0-9]/u,
      /(?:개인번호|비밀번호).{0,15}(?:알려|입력|제공)/u,
    ],
    marker: "【有人チャットへ転送】",
    sourceWithTransfer: scenarioPaths.chat.withTransfer,
    ...localizedScenarioPaths("チャット-粗大ごみの出し方_収集申込み", "ko"),
  },
  {
    channel: "chat",
    locale: "pt",
    localeCode: "pt",
    withoutTransferPatterns: [
      /cadeira de escritório/iu,
      /120\s*cm/iu,
      /70\s*cm/iu,
      /uma cadeira/iu,
      /lixo de grande porte/iu,
      /desde a solicitação até o descarte/iu,
    ],
    withTransferPatterns: [
      /um guarda-roupa/iu,
      /180\s*cm/iu,
      /120\s*cm/iu,
      /mãe idosa/iu,
      /assistência para retirá-lo/iu,
    ],
    consentPattern:
      /Por favor, compartilhe essas informações e transfira a conversa para um atendente humano/iu,
    unsafeLanguagePatterns: [
      /(?:reserva|solicitação).{0,30}(?:confirmad[ao]|concluíd[ao]|aceita)/iu,
      /número de (?:protocolo|atendimento|reserva)\s*(?:é|:)?\s*[A-Z0-9]/iu,
      /(?:informe|digite|forneça|compartilhe).{0,30}(?:número individual|senha|PIN)/iu,
    ],
    marker: "【有人チャットへ転送】",
    sourceWithTransfer: scenarioPaths.chat.withTransfer,
    ...localizedScenarioPaths("チャット-粗大ごみの出し方_収集申込み", "pt"),
  },
  {
    channel: "chat",
    locale: "vi",
    localeCode: "vi",
    withoutTransferPatterns: [
      /ghế văn phòng/iu,
      /120\s*cm/iu,
      /70\s*cm/iu,
      /một chiếc/iu,
      /rác cồng kềnh/iu,
      /đăng ký.*điểm thu gom/isu,
    ],
    withTransferPatterns: [
      /một chiếc tủ/iu,
      /180\s*cm/iu,
      /120\s*cm/iu,
      /mẹ lớn tuổi/iu,
      /hỗ trợ đưa đồ ra ngoài/iu,
    ],
    consentPattern:
      /Xin hãy chia sẻ những thông tin này và chuyển cuộc trò chuyện cho nhân viên hỗ trợ/iu,
    unsafeLanguagePatterns: [
      /(?:đặt lịch|đăng ký).{0,30}(?:đã )?(?:xác nhận|hoàn tất|tiếp nhận)/iu,
      /mã (?:tiếp nhận|đăng ký|đặt lịch)\s*(?:là|:)?\s*[A-Z0-9]/iu,
      /(?:cho biết|nhập|cung cấp|chia sẻ).{0,30}(?:mã số cá nhân|mật khẩu|mã PIN)/iu,
    ],
    marker: "【有人チャットへ転送】",
    sourceWithTransfer: scenarioPaths.chat.withTransfer,
    ...localizedScenarioPaths("チャット-粗大ごみの出し方_収集申込み", "vi"),
  },
] as const;

function read(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function count(content: string, marker: string) {
  return content.split(marker).length - 1;
}

function fromMarker(content: string, marker: string) {
  const markerIndex = content.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} must exist`);
  return content.slice(markerIndex);
}

function icebreakerLines(content: string) {
  const match = content.match(/アイスブレイク:\s*\n([\s\S]*?)\n\s*メイン:/u);
  assert.ok(match, "voice flow must separate icebreaker and main prompts");
  return match[1].split("\n").filter((line) => line.startsWith("> "));
}

test("voice and chat premises use the same compact demo structure", () => {
  const requiredHeadings = [
    "## 狙い",
    "## 答えられる範囲",
    "## 意図的に答えられない範囲",
    "## 事前確認",
  ];

  for (const channel of Object.values(scenarioPaths)) {
    const premise = read(channel.premise);

    for (const heading of requiredHeadings) {
      assert.equal(
        count(premise, heading),
        1,
        `${channel.premise} must contain ${heading} exactly once`,
      );
    }
  }
});

test("demo flows use semantic progress tables instead of fixed AI scripts", () => {
  const flowPaths = Object.values(scenarioPaths).flatMap((channel) => [
    channel.withoutTransfer,
    channel.withTransfer,
  ]);

  for (const filePath of flowPaths) {
    const content = read(filePath);
    assert.match(content, /\| 段階 \| デモ担当者 \| 確認するAI動作 \| 次へ進む条件 \|/);
    assert.doesNotMatch(content, /^AI(?:エージェント)?：/mu);
  }
});

test("handoff markers exist only once in each with-transfer flow", () => {
  const voiceMarker = "【有人担当へ転送】";
  const chatMarker = "【有人チャットへ転送】";

  assert.equal(count(read(scenarioPaths.voice.withoutTransfer), voiceMarker), 0);
  assert.equal(count(read(scenarioPaths.voice.withTransfer), voiceMarker), 1);
  assert.equal(count(read(scenarioPaths.chat.withoutTransfer), chatMarker), 0);
  assert.equal(count(read(scenarioPaths.chat.withTransfer), chatMarker), 1);
});

test("AI portions do not fabricate bulky-waste transactions", () => {
  const chatWithoutTransfer = read(scenarioPaths.chat.withoutTransfer);
  const chatWithTransfer = read(scenarioPaths.chat.withTransfer).split(
    "【有人チャットへ転送】",
  )[0];
  const prohibitedClaims = [
    /A123456|B987654|〇月〇日|〇〇円/u,
    /(?:¥|￥)\s*\d|\d[\d,.]*\s*(?:円|yen)/iu,
    /(?:\d{4}年)?\d{1,2}月\d{1,2}日/u,
    /(?:予約|申込み|申請)(?:を|が)?(?:確定|完了)(?:しました|しています|済みです)/u,
    /(?:予約|申込み|申請)を受け付けました/u,
    /受付番号(?:は|：|:)\s*[「"]?[A-Z0-9-]{4,}/u,
    /(?:メール|Eメール)(?:を)?(?:送信しました|送りました)/u,
    /(?:空き|予約可能)(?:があります|です)/u,
    /以上で手続きは完了です/u,
  ];

  for (const content of [chatWithoutTransfer, chatWithTransfer]) {
    for (const prohibitedClaim of prohibitedClaims) {
      assert.doesNotMatch(content, prohibitedClaim);
    }
  }
});

test("handoff flows require consent and a single transfer", () => {
  const voice = read(scenarioPaths.voice.withTransfer).split("【有人担当へ転送】")[0];
  const chat = read(scenarioPaths.chat.withTransfer).split(
    "【有人チャットへ転送】",
  )[0];

  for (const content of [voice, chat]) {
    assert.match(content, /同意/);
    assert.match(content, /転送を一度だけ実行する/);
  }
});

test("multilingual demo files keep the operator-facing compact structure", () => {
  const requiredPremiseHeadings = [
    "## 検証言語",
    "## 狙い",
    "## 答えられる範囲",
    "## 意図的に答えられない範囲",
    "## 事前確認",
  ];
  const progressTable =
    /\| 段階 \| デモ担当者 \| 確認するAI動作 \| 次へ進む条件 \|/;

  for (const scenario of multilingualScenarios) {
    const premise = read(scenario.premise);
    const withoutTransfer = read(scenario.withoutTransfer);
    const withTransfer = read(scenario.withTransfer);

    for (const heading of requiredPremiseHeadings) {
      assert.equal(
        count(premise, heading),
        1,
        `${scenario.premise} must contain ${heading} exactly once`,
      );
    }

    assert.match(premise, new RegExp(scenario.localeCode, "u"));
    assert.match(withoutTransfer, progressTable);
    assert.match(withTransfer, progressTable);
    assert.doesNotMatch(withoutTransfer, /^AI(?:エージェント)?：/mu);
    assert.doesNotMatch(withTransfer, /^AI(?:エージェント)?：/mu);
    for (const pattern of scenario.withoutTransferPatterns) {
      assert.match(
        withoutTransfer,
        pattern,
        `${scenario.withoutTransfer} must retain ${pattern}`,
      );
    }

    const withTransferAiPortion = withTransfer.split(scenario.marker)[0];
    for (const pattern of scenario.withTransferPatterns) {
      assert.match(
        withTransferAiPortion,
        pattern,
        `${scenario.withTransfer} must retain ${pattern}`,
      );
    }
    assert.match(withTransferAiPortion, scenario.consentPattern);

    const multilingualAiContent = [
      premise,
      withoutTransfer,
      withTransferAiPortion,
    ].join("\n");
    assert.doesNotMatch(multilingualAiContent, /archives/iu);
    assert.doesNotMatch(
      multilingualAiContent,
      /(?:\+?81[- ]?)?0\d{1,4}[- ]\d{1,4}[- ]\d{3,4}/u,
    );
    for (const unsafePattern of scenario.unsafeLanguagePatterns) {
      assert.doesNotMatch(multilingualAiContent, unsafePattern);
    }
  }
});

test("multilingual handoff flows preserve the existing human-agent section", () => {
  for (const scenario of multilingualScenarios) {
    const withoutTransfer = read(scenario.withoutTransfer);
    const withTransfer = read(scenario.withTransfer);
    const sourceWithTransfer = read(scenario.sourceWithTransfer);

    assert.equal(count(withoutTransfer, scenario.marker), 0);
    assert.equal(count(withTransfer, scenario.marker), 1);
    assert.equal(
      fromMarker(withTransfer, scenario.marker),
      fromMarker(sourceWithTransfer, scenario.marker),
      `${scenario.locale} must not change the existing post-handoff script`,
    );

    const aiPortion = withTransfer.split(scenario.marker)[0];
    assert.match(aiPortion, /同意/);
    assert.match(aiPortion, /転送を一度だけ実行する/);
    assert.doesNotMatch(aiPortion, /1007/);
  }
});

test("English voice files mirror the current Japanese icebreaker prompts", () => {
  const pairs = [
    [
      scenarioPaths.voice.withoutTransfer,
      localizedScenarioPaths("音声-マイナポータルログイン", "en")
        .withoutTransfer,
    ],
    [
      scenarioPaths.voice.withTransfer,
      localizedScenarioPaths("音声-マイナポータルログイン", "en").withTransfer,
    ],
  ] as const;

  for (const [sourcePath, englishPath] of pairs) {
    const sourceIcebreakers = icebreakerLines(read(sourcePath));
    const englishIcebreakers = icebreakerLines(read(englishPath));

    assert.equal(
      englishIcebreakers.length,
      sourceIcebreakers.length,
      `${englishPath} must translate every current Japanese icebreaker`,
    );
    assert.ok(
      englishIcebreakers.every((line) => /[A-Za-z]/u.test(line)),
      `${englishPath} icebreakers must be written in English`,
    );
  }

  const englishVoice = localizedScenarioPaths(
    "音声-マイナポータルログイン",
    "en",
  );
  const withoutTransfer = read(englishVoice.withoutTransfer);
  const withTransfer = read(englishVoice.withTransfer);

  assert.match(
    withoutTransfer,
    /link my driver’s license to my My Number Card/iu,
  );
  assert.match(withoutTransfer, /change my MynaPortal password/iu);
  assert.match(withTransfer, /only twice today/iu);
  assert.match(withTransfer, /failed attempts from before today also count/iu);
  assert.match(withTransfer, /city office see how many times/iu);
  assert.match(
    withTransfer,
    /city office check whether my MynaPortal login PIN is currently locked/iu,
  );
});

test("multilingual bulky-waste AI portions do not invent transactions", () => {
  const prohibitedClaims = [
    /A123456|B987654|〇月〇日|〇〇円/u,
    /(?:¥|￥|R\$|₩|₫)\s*\d/u,
    /(?:予約|申込み|申請)(?:を|が)?(?:確定|完了)(?:しました|しています|済みです)/u,
    /(?:予約|申込み|申請)を受け付けました/u,
    /受付番号(?:は|：|:)\s*[「"]?[A-Z0-9-]{4,}/u,
    /(?:メール|Eメール)(?:を)?(?:送信しました|送りました)/u,
    /(?:空き|予約可能)(?:があります|です)/u,
    /以上で手続きは完了です/u,
  ];

  for (const scenario of multilingualScenarios.filter(
    ({ channel }) => channel === "chat",
  )) {
    const aiPortions = [
      read(scenario.withoutTransfer),
      read(scenario.withTransfer).split(scenario.marker)[0],
    ];

    for (const content of aiPortions) {
      for (const prohibitedClaim of prohibitedClaims) {
        assert.doesNotMatch(content, prohibitedClaim);
      }
    }
  }
});
