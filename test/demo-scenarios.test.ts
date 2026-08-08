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
      /(?=.*My Number Card)(?=.*iPhone)(?=.*MynaPortal)(?=.*smartphone case)(?=.*(?:related|reason|affect|caus))/iu,
      /(?=.*(?:removed|taken off) the case)(?=.*where.*iPhone)(?=.*card)/iu,
      /(?=.*top)(?=.*card)(?=.*iPhone)(?=.*(?:keep|remain).*(?:still|in place))(?=.*(?:reading|scan).*(?:finish|complete))/iu,
      /(?=.*(?:log in|login))(?=.*four-digit)(?=.*PIN)/iu,
      /(?=.*electronic certificate)(?=.*expir)(?=.*MynaPortal)(?=.*(?:can(?:not|['’]t)|unable).*(?:log in|login))/iu,
    ],
    withTransferPatterns: [
      /four-digit PIN/iu,
      /three times in a row/iu,
      /(?:locked|locked out)/iu,
      /what I need to bring/iu,
      /unlock(?:ed)? today/iu,
    ],
    consentPattern:
      /Yes[,.]?\s*Please share (?:these details|this information) and transfer me to (?:a )?human agent/iu,
    optionalHandoffQuestionPattern:
      /(?=.*(?:can(?:not|['’]t)|unable))(?=.*(?:this (?:call|phone)|over the phone))(?=.*(?:what I need to bring|items I need to bring))(?=.*unlock(?:ed)?.*(?:today|same day))/iu,
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
      /(?=.*office chair)(?=.*(?:casters|wheels))(?=.*before (?:applying|submitting an application))/iu,
      /(?=.*120\s*cm)(?=.*70\s*cm)(?=.*collection date)(?=.*(?:(?:pay|payment).*(?:fee)|fee.*(?:pay|payment)))/iu,
      /(?=.*(?:disposal|processing) (?:ticket|sticker))(?=.*(?:attach|stick))(?=.*when and where.*(?:put|set).*(?:out|collection))/iu,
      /(?=.*(?:apartment|condominium|multi-unit))(?=.*where.*(?:put|set).*(?:out|collection))/iu,
      /(?=.*(?:reservation|booking))(?=.*(?:complete|confirm|finali[sz]e))(?=.*(?:this )?chat)/iu,
    ],
    withTransferPatterns: [
      /one chest of drawers/iu,
      /180\s*cm/iu,
      /120\s*cm/iu,
      /elderly mother/iu,
      /carry-out assistance/iu,
    ],
    consentPattern: /Please share these details and transfer me to a human agent/iu,
    optionalHandoffQuestionPattern:
      /can(?:not|['’]t) determine in this chat whether .*eligible for (?:carry-out )?assistance/iu,
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
      /(?=.*(?:带脚轮|有轮子).*办公椅)(?=.*申请前)(?=.*确认)/u,
      /(?=.*120\s*厘米)(?=.*70\s*厘米)(?=.*收集日期)(?=.*(?:费用|支付))/u,
      /(?=.*处理券)(?=.*贴在?哪里)(?=.*什么时候)(?=.*放到?哪里)/u,
      /(?=.*(?:公寓楼|集合住宅|公寓))(?=.*放在哪里)/u,
      /(?=.*聊天)(?=.*(?:完成|确认).*(?:收集)?预约)/u,
    ],
    withTransferPatterns: [
      /一个.*衣柜/u,
      /180厘米/u,
      /120厘米/u,
      /年迈的母亲/u,
      /搬出协助/u,
    ],
    consentPattern: /请共享以上内容，并将我转接给人工客服/u,
    optionalHandoffQuestionPattern:
      /(?:无法|不能).*通过.*聊天.*判断.*(?:符合|属于).*协助.*(?:条件|对象)/u,
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
      /(?=.*(?:바퀴 달린|바퀴가 있는).*사무용 의자)(?=.*신청.*전)(?=.*확인)/u,
      /(?=.*120\s*cm)(?=.*70\s*cm)(?=.*수거일)(?=.*(?:(?:수수료|요금).*(?:납부|지불)))/iu,
      /(?=.*(?:처리권|처리 스티커|스티커))(?=.*어디에 붙)(?=.*언제 어디에)/u,
      /(?=.*(?:공동주택|아파트|집합주택))(?=.*어디에 내놓)/u,
      /(?=.*채팅)(?=.*(?:수거 )?예약)(?=.*확정)/u,
    ],
    withTransferPatterns: [
      /장롱 1개/u,
      /180cm/u,
      /120cm/u,
      /고령인 어머니/u,
      /운반 지원/u,
    ],
    consentPattern: /이 내용을 공유하고 상담원에게 연결해 주세요/u,
    optionalHandoffQuestionPattern:
      /채팅에서는?.*지원 대상인지.*판단할 수 없/u,
    unsafeLanguagePatterns: [
      /(?:예약|신청)(?:이|을|가)?\s*(?:확정|완료|접수)(?:되었|됐|했습니다|되었습니다)/u,
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
      /(?=.*cadeira de escritório)(?=.*(?:rodízios|rodas))(?=.*antes de.*solicitação)(?=.*verificar)/iu,
      /(?=.*120\s*cm)(?=.*70\s*cm)(?=.*data da coleta)(?=.*(?:(?:pagamento|pagar).*(?:taxa|tarifa)|(?:taxa|tarifa).*(?:pagamento|pagar)))/iu,
      /(?=.*(?:etiqueta|selo|bilhete).*(?:descarte|resíduo))(?=.*(?:colar|fixar))(?=.*quando e onde)/iu,
      /(?=.*(?:condomínio|apartamento|prédio residencial))(?=.*onde.*(?:colocar|deixar))/iu,
      /(?=.*(?:chat|conversa))(?=.*reserva.*(?:coleta|recolha))(?=.*(?:confirmar|finalizar|concluir))/iu,
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
    optionalHandoffQuestionPattern:
      /não é possível.*(?:determinar|verificar).*por (?:este|esse) chat.*(?:direito|elegív).*(?:assistência|apoio)/iu,
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
      /(?=.*ghế văn phòng)(?=.*(?:bánh xe|bánh lăn))(?=.*trước khi đăng ký)(?=.*xác nhận)/iu,
      /(?=.*120\s*cm)(?=.*70\s*cm)(?=.*ngày thu gom)(?=.*(?:(?:thanh toán|trả).*(?:phí|lệ phí)))/iu,
      /(?=.*phiếu.*(?:xử lý|thu gom))(?=.*dán.*(?:ở|vào) đâu)(?=.*(?:khi nào|lúc nào).*(?:ở đâu|tại đâu|đâu))/iu,
      /(?=.*(?:khu chung cư|chung cư|tòa nhà căn hộ))(?=.*(?:mang|đặt).*(?:ra )?đâu)/iu,
      /(?=.*(?:trò chuyện|chat))(?=.*đăng ký thu gom)(?=.*hoàn tất)(?=.*xác nhận)/iu,
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
    optionalHandoffQuestionPattern:
      /qua.*(?:trò chuyện|chat).*(?:không thể|không).*xác định.*(?:thuộc diện|đủ điều kiện).*(?:hỗ trợ)/iu,
    unsafeLanguagePatterns: [
      /(?:đặt lịch|đăng ký).{0,20}(?:đã\s+)?(?:được\s+)?(?:xác nhận|hoàn tất|tiếp nhận)(?:\s+(?:rồi|thành công)|[.!。]\s*$)/imu,
      /mã (?:tiếp nhận|đăng ký|đặt lịch)\s*(?:là|:)?\s*[A-Z0-9]/iu,
      /(?:cho biết|nhập|cung cấp|chia sẻ).{0,30}(?:mã số cá nhân|mật khẩu|mã PIN)/iu,
    ],
    marker: "【有人チャットへ転送】",
    sourceWithTransfer: scenarioPaths.chat.withTransfer,
    ...localizedScenarioPaths("チャット-粗大ごみの出し方_収集申込み", "vi"),
  },
] as const;

const japaneseChatRallyScenario = {
  locale: "ja",
  withoutTransfer: scenarioPaths.chat.withoutTransfer,
  withTransfer: scenarioPaths.chat.withTransfer,
  withoutTransferPatterns: [
    /(?=.*キャスター付き.*事務用椅子)(?=.*申込み前)(?=.*確認)/u,
    /(?=.*120\s*(?:センチ|cm))(?=.*70\s*(?:センチ|cm))(?=.*収集日)(?=.*支払い)/iu,
    /(?=.*処理券)(?=.*どこに貼)(?=.*いつどこへ)/u,
    /(?=.*集合住宅)(?=.*どこに出)/u,
    /(?=.*チャット)(?=.*予約確定)/u,
  ],
  withTransferPatterns: [
    /タンス/u,
    /180\s*(?:センチ|cm)/iu,
    /120\s*(?:センチ|cm)/iu,
    /高齢の母/u,
    /運び出し支援/u,
  ],
  consentPattern: /この内容を共有して、有人担当へ引き継いでください/u,
  optionalHandoffQuestionPattern:
    /このチャットでは.*支援の対象になるか判断できない/u,
  marker: "【有人チャットへ転送】",
} as const;

const japaneseVoiceRallyScenario = {
  locale: "ja",
  withoutTransfer: scenarioPaths.voice.withoutTransfer,
  withTransfer: scenarioPaths.voice.withTransfer,
  withoutTransferPatterns: [
    /(?=.*iPhone)(?=.*マイナンバーカード)(?=.*マイナポータル)(?=.*スマートフォンのケース)(?=.*関係)/iu,
    /(?=.*ケースを外)(?=.*カード)(?=.*iPhone)(?=.*どこに当て)/iu,
    /(?=.*上部に当て)(?=.*カード)(?=.*iPhone)(?=.*動かさず)(?=.*読み取り.*終)/iu,
    /(?=.*ログイン)(?=.*暗証番号)(?=.*数字4桁)/u,
    /(?=.*電子証明書)(?=.*期限が切)(?=.*マイナポータル)(?=.*ログインでき(?:ない|ません))/u,
  ],
  withTransferPatterns: [
    /数字4桁の暗証番号/u,
    /3回連続/u,
    /解除手続きに必要な持ち物/u,
    /今日中に対応/u,
  ],
  consentPattern: /はい、この内容を共有して、有人担当へ転送してください/u,
  optionalHandoffQuestionPattern:
    /(?=.*解除に必要な持ち物)(?=.*今日中に対応)(?=.*この電話)(?=.*分からない)/u,
  marker: "【有人担当へ転送】",
} as const;

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

function progressCells(content: string, stage: string, filePath: string) {
  const rowPrefix = `| ${stage} |`;
  const rows = content
    .split("\n")
    .filter((line) => line.startsWith(rowPrefix));

  assert.equal(
    rows.length,
    1,
    `${filePath} must contain exactly one ${stage} progress row`,
  );

  const row = rows[0];
  const cells = row
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());

  assert.equal(cells.length, 4, `${filePath} ${stage} must have four cells`);

  return {
    row,
    operator: cells[1],
    aiAction: cells[2],
    nextCondition: cells[3],
  };
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

test("My Number voice flows support required and optional conversation rallies", () => {
  const voiceRallyScenarios: Array<{
    locale: string;
    withoutTransfer: string;
    withTransfer: string;
    withoutTransferPatterns: readonly RegExp[];
    withTransferPatterns: readonly RegExp[];
    consentPattern: RegExp;
    optionalHandoffQuestionPattern: RegExp;
    marker: string;
  }> = [japaneseVoiceRallyScenario];

  for (const scenario of multilingualScenarios) {
    if (scenario.channel === "voice") {
      voiceRallyScenarios.push(scenario);
    }
  }

  const withoutTransferStages = [
    "1（必須）",
    "2（必須）",
    "3（必須）",
    "4（任意）",
    "5（任意）",
  ];
  const withoutTransferAiPatterns = [
    /(?=.*ケース)(?=.*(?:外す|外して))(?=.*読取)/u,
    /(?=.*カード(?:の)?(?:中心|中央))(?=.*iPhone(?:の)?上部)(?=.*当て)/iu,
    /(?=.*カード)(?=.*iPhone)(?=.*(?:ずらさず|動かさず))(?=.*待)/iu,
    /(?=.*利用者証明用電子証明書)(?=.*数字4桁)(?=.*暗証番号)/u,
    /(?=.*電子証明書)(?=.*(?:期限(?:が)?切|期限切れ))(?=.*ログインでき(?:ない|ず))/u,
  ];

  for (const scenario of voiceRallyScenarios) {
    const withoutTransfer = read(scenario.withoutTransfer);
    const withoutTransferActions: string[] = [];

    assert.equal(
      scenario.withoutTransferPatterns.length,
      withoutTransferStages.length,
      `${scenario.locale} must define one prompt pattern per voice turn`,
    );

    let previousRowIndex = -1;
    for (const [index, stage] of withoutTransferStages.entries()) {
      const cells = progressCells(
        withoutTransfer,
        stage,
        scenario.withoutTransfer,
      );

      assert.match(
        cells.operator,
        scenario.withoutTransferPatterns[index],
        `${scenario.locale} ${stage} must keep the intended resident utterance`,
      );
      assert.match(
        cells.aiAction,
        withoutTransferAiPatterns[index],
        `${scenario.locale} ${stage} must keep the intended AI behavior`,
      );

      const rowIndex = withoutTransfer.indexOf(cells.row);
      assert.ok(
        rowIndex > previousRowIndex,
        `${scenario.locale} without-transfer voice turns must stay in order`,
      );
      previousRowIndex = rowIndex;
      withoutTransferActions.push(cells.aiAction);
    }

    assert.match(
      withoutTransfer,
      /3ターン目(?:の回答後)?(?:で|に)?終了(?:してよい|できる)/u,
    );
    assert.match(
      withoutTransfer,
      /(?:デモ時間.*(?:4〜5|4・5)ターン目|(?:4〜5|4・5)ターン目.*(?:任意|時間))/u,
    );
    assert.match(withoutTransfer, /有人転送(?:を実行)?せず/u);

    const withTransfer = read(scenario.withTransfer);
    const firstTurn = progressCells(
      withTransfer,
      "1（基本）",
      scenario.withTransfer,
    );
    const optionalTurn = progressCells(
      withTransfer,
      "2（任意）",
      scenario.withTransfer,
    );
    const consentTurn = progressCells(
      withTransfer,
      "2または3（基本）",
      scenario.withTransfer,
    );

    for (const pattern of scenario.withTransferPatterns) {
      assert.match(
        firstTurn.operator,
        pattern,
        `${scenario.locale} handoff turn 1 must keep ${pattern}`,
      );
    }
    assert.match(firstTurn.aiAction, /3回連続(?:の)?誤入力.*ロック/u);
    assert.match(
      firstTurn.aiAction,
      /持ち物.*当日対応.*推測しない/u,
    );
    assert.match(
      firstTurn.nextCondition,
      /(?=.*個別確認.*必要)(?=.*有人転送.*同意)/u,
    );

    assert.match(optionalTurn.operator, scenario.optionalHandoffQuestionPattern);
    assert.match(
      optionalTurn.aiAction,
      /(?=.*持ち物)(?=.*当日対応)(?=.*(?:回答|判断)でき(?:ない|ず))(?=.*個別確認)/u,
    );
    assert.match(
      optionalTurn.nextCondition,
      /(?=.*転送を実行していない)(?=.*明示.*同意)/u,
    );

    assert.match(consentTurn.operator, scenario.consentPattern);
    assert.match(consentTurn.aiAction, /ログイン(?:できない|不能).*要約/u);
    assert.match(
      consentTurn.aiAction,
      /(?=.*数字4桁.*3回)(?=.*持ち物)(?=.*当日対応)/u,
    );
    assert.match(
      consentTurn.nextCondition,
      /(?=.*個人番号.*暗証番号.*聞かず)(?=.*明示的な同意後に(?:有人)?転送を一度だけ実行する)/u,
    );

    assert.ok(
      withTransfer.indexOf(firstTurn.row) < withTransfer.indexOf(optionalTurn.row),
      `${scenario.locale} optional voice question must follow the first turn`,
    );
    assert.ok(
      withTransfer.indexOf(optionalTurn.row) < withTransfer.indexOf(consentTurn.row),
      `${scenario.locale} optional voice question must precede consent`,
    );
    assert.match(
      withTransfer,
      /(?=.*(?:基本は|省略した場合は)2ターン)(?=.*3ターン)/u,
    );

    const withTransferAiPortion = withTransfer.split(scenario.marker)[0];
    assert.equal(
      count(withTransferAiPortion, "転送を一度だけ実行する"),
      1,
      `${scenario.locale} voice transfer must be executed once after consent`,
    );
    assert.equal(count(withoutTransfer, scenario.marker), 0);
    assert.equal(count(withTransfer, scenario.marker), 1);

    const postTransferHeadingIndex = withTransfer.indexOf("## 転送後の操作");
    const markerIndex = withTransfer.indexOf(scenario.marker);
    assert.ok(
      postTransferHeadingIndex > withTransfer.indexOf(consentTurn.row),
      `${scenario.locale} transfer wait must follow all voice turns`,
    );
    assert.ok(
      markerIndex > postTransferHeadingIndex,
      `${scenario.locale} transfer wait must precede the human script`,
    );
    const postTransferSection = withTransfer
      .slice(postTransferHeadingIndex, markerIndex)
      .trim();
    const postTransferLines = postTransferSection
      .split("\n")
      .filter((line) => line.trim().length > 0);
    assert.equal(
      postTransferLines.length,
      2,
      `${scenario.locale} transfer wait must be one sentence outside the turn table`,
    );
    assert.equal(postTransferLines[0], "## 転送後の操作");
    assert.doesNotMatch(postTransferSection, /^\|/mu);
    assert.doesNotMatch(
      withTransfer.slice(0, postTransferHeadingIndex),
      /接続中は(?:追加入力せず|そのまま)待/u,
    );
    assert.match(
      postTransferSection,
      /接続中は(?:追加入力せず|そのまま)待/u,
    );

    const aiActions = [
      ...withoutTransferActions,
      firstTurn.aiAction,
      optionalTurn.aiAction,
      consentTurn.aiAction,
    ].join("\n");
    assert.doesNotMatch(
      aiActions,
      /(?:個人番号|暗証番号(?:そのもの)?)(?:を|は).{0,24}(?:教えて|伝えて|入力して|提供して|共有して|開示して|読み上げて|聞く|聞きます|尋ねる|尋ねます|要求する|要求します)/u,
    );
    assert.doesNotMatch(aiActions, /1007/u);
    assert.doesNotMatch(aiActions, /内線(?:番号)?\s*[:：]?\s*\d{2,}/u);
    assert.doesNotMatch(
      aiActions,
      /(?:0\d{9,10}|(?:\+?81[- ]?)?0\d{1,4}[- ]\d{1,4}[- ]\d{3,4})/u,
    );
    assert.doesNotMatch(
      aiActions,
      /(?:(?:必要な持ち物|持ち物)(?:は|として).{1,50}(?:です|必要|持参|用意)|.{1,50}(?:が|を)(?:必要な持ち物|持ち物)(?:です|になります))/u,
    );
    assert.doesNotMatch(
      aiActions,
      /(?:(?:今日|本日|当日)(?:中)?(?:に|の)?(?:対応|解除).{0,12}(?:できます|可能です|行えます|受けられます)|(?:今日|本日|当日)(?:中)?(?:に|の)?.{0,20}(?:対応可能|解除可能))/u,
    );
  }
});

test("bulky-waste chat flows support required and optional conversation rallies", () => {
  const chatRallyScenarios: Array<{
    locale: string;
    withoutTransfer: string;
    withTransfer: string;
    withoutTransferPatterns: readonly RegExp[];
    withTransferPatterns: readonly RegExp[];
    consentPattern: RegExp;
    optionalHandoffQuestionPattern: RegExp;
    marker: string;
  }> = [japaneseChatRallyScenario];

  for (const scenario of multilingualScenarios) {
    if (scenario.channel === "chat") {
      chatRallyScenarios.push(scenario);
    }
  }

  const withoutTransferStages = [
    "1（必須）",
    "2（必須）",
    "3（必須）",
    "4（任意）",
    "5（任意）",
  ];
  const withoutTransferAiPatterns = [
    /(?=.*品目)(?=.*(?:大きさ|寸法))(?=.*数量)(?=.*排出場所)/u,
    /(?=.*収集日)(?=.*手数料)(?=.*申込み時)(?=.*(?:支払|処理券))/u,
    /(?=.*処理券)(?=.*見やす)(?=.*はがれ)(?=.*指定.*日時)(?=.*指定場所)/u,
    /(?=.*(?:管理者|管理組合|建物のルール|指定))(?=.*(?:排出場所|指定場所|場所へ出す))(?=.*(?:室内|共用通路|建物のルール))/u,
    /(?=.*予約確定)(?=.*(?:料金算定|正確な料金))(?=.*受付番号発行)(?=.*メール送信)(?=.*(?:できない|行わない))/u,
  ];

  for (const scenario of chatRallyScenarios) {
    const withoutTransfer = read(scenario.withoutTransfer);

    assert.equal(
      scenario.withoutTransferPatterns.length,
      withoutTransferStages.length,
      `${scenario.locale} must define one prompt pattern per chat turn`,
    );

    let previousRowIndex = -1;
    for (const [index, stage] of withoutTransferStages.entries()) {
      const cells = progressCells(
        withoutTransfer,
        stage,
        scenario.withoutTransfer,
      );

      assert.match(
        cells.operator,
        scenario.withoutTransferPatterns[index],
        `${scenario.locale} ${stage} must keep the intended resident question`,
      );
      assert.match(
        cells.aiAction,
        withoutTransferAiPatterns[index],
        `${scenario.locale} ${stage} must keep the intended AI behavior`,
      );

      const rowIndex = withoutTransfer.indexOf(cells.row);
      assert.ok(
        rowIndex > previousRowIndex,
        `${scenario.locale} without-transfer turns must stay in order`,
      );
      previousRowIndex = rowIndex;
    }

    assert.match(withoutTransfer, /3ターン目(?:の回答後)?(?:で|に)?終了してよい/u);
    assert.match(withoutTransfer, /(?:4〜5|4・5)ターン目/u);
    assert.match(withoutTransfer, /有人転送せず/u);

    const withTransfer = read(scenario.withTransfer);
    const firstTurn = progressCells(
      withTransfer,
      "1（基本）",
      scenario.withTransfer,
    );
    const optionalTurn = progressCells(
      withTransfer,
      "2（任意）",
      scenario.withTransfer,
    );
    const consentTurn = progressCells(
      withTransfer,
      "2または3（基本）",
      scenario.withTransfer,
    );

    const withTransferAiPortion = withTransfer.split(scenario.marker)[0];
    for (const pattern of scenario.withTransferPatterns) {
      assert.match(
        withTransferAiPortion,
        pattern,
        `${scenario.locale} handoff turn 1 must keep ${pattern}`,
      );
    }
    assert.match(firstTurn.aiAction, /支援の対象可否を推測しない/u);
    assert.match(firstTurn.nextCondition, /有人転送の同意を求める/u);
    assert.match(optionalTurn.operator, scenario.optionalHandoffQuestionPattern);
    assert.match(
      optionalTurn.aiAction,
      /(?=.*(?:チャット|このチャット))(?=.*対象可否.*(?:判断できず|判断できない|推測できない))(?=.*個別(?:確認|判断))/u,
    );
    assert.match(
      optionalTurn.nextCondition,
      /(?=.*(?:転送を実行していない|有人転送))(?=.*明示.*同意)/u,
    );
    assert.match(consentTurn.operator, scenario.consentPattern);
    assert.match(consentTurn.aiAction, /要約する/u);
    assert.match(
      consentTurn.nextCondition,
      /明示的な同意後に有人転送を一度だけ実行する/u,
    );

    assert.ok(
      withTransfer.indexOf(firstTurn.row) < withTransfer.indexOf(optionalTurn.row),
      `${scenario.locale} optional handoff question must follow the first turn`,
    );
    assert.ok(
      withTransfer.indexOf(optionalTurn.row) < withTransfer.indexOf(consentTurn.row),
      `${scenario.locale} optional handoff question must precede consent`,
    );
    assert.match(
      withTransfer,
      /(?=.*(?:基本は|省略した場合は)2ターン)(?=.*3ターン)/u,
    );

    const postTransferHeadingIndex = withTransfer.indexOf("## 転送後の操作");
    const markerIndex = withTransfer.indexOf(scenario.marker);
    assert.ok(
      postTransferHeadingIndex > withTransfer.indexOf(consentTurn.row),
      `${scenario.locale} transfer wait must follow all conversation turns`,
    );
    assert.ok(
      markerIndex > postTransferHeadingIndex,
      `${scenario.locale} post-transfer operation must precede the human script`,
    );
    const postTransferSection = withTransfer
      .slice(postTransferHeadingIndex, markerIndex)
      .trim();
    const postTransferLines = postTransferSection
      .split("\n")
      .filter((line) => line.trim().length > 0);
    assert.equal(
      postTransferLines.length,
      2,
      `${scenario.locale} transfer wait must be one sentence outside the turn table`,
    );
    assert.equal(postTransferLines[0], "## 転送後の操作");
    assert.doesNotMatch(postTransferSection, /^\|/mu);
    assert.doesNotMatch(
      withTransfer.slice(0, postTransferHeadingIndex),
      /接続中は追加入力せず待/u,
    );
    assert.match(
      postTransferSection,
      /接続中は追加入力せず待/u,
    );
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
