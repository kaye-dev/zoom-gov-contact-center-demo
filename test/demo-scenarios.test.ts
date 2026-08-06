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

function read(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function count(content: string, marker: string) {
  return content.split(marker).length - 1;
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
