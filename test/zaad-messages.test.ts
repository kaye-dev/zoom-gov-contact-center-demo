import assert from "node:assert/strict";
import test from "node:test";

import {
  countZaadTextCharacters,
  parseZaadMessageInput,
  truncateZaadTextCharacters,
  ZAAD_ERROR_CODES,
  ZAAD_LIMITS,
} from "../lib/zaad/contracts";

function message(body: string, revision?: number) {
  return {
    name: "合成メッセージ",
    body,
    languageCode: "ja-JP",
    voiceId: "Tomoko",
    ...(revision === undefined ? {} : { revision }),
  };
}

test("message DTO accepts 1 and 500 characters and rejects 501 before Zoom", () => {
  assert.equal(ZAAD_LIMITS.messageBody, 500);
  assert.equal(parseZaadMessageInput(message("あ")).ok, true);
  assert.equal(parseZaadMessageInput(message("あ".repeat(500))).ok, true);
  assert.deepEqual(parseZaadMessageInput(message("あ".repeat(501))), {
    ok: false,
    code: ZAAD_ERROR_CODES.invalidRequest,
  });
});

test("message boundary counts Unicode code points consistently", () => {
  const exactBoundary = "🚨".repeat(500);
  assert.equal(countZaadTextCharacters(exactBoundary), 500);
  assert.equal(parseZaadMessageInput(message(exactBoundary)).ok, true);
  assert.deepEqual(parseZaadMessageInput(message(`${exactBoundary}🚨`)), {
    ok: false,
    code: ZAAD_ERROR_CODES.invalidRequest,
  });
  assert.equal(truncateZaadTextCharacters(`${exactBoundary}🚨`, 500), exactBoundary);
});

test("message update uses the same 500-character boundary with a positive revision", () => {
  assert.equal(parseZaadMessageInput(message("あ".repeat(500), 1), true).ok, true);
  assert.deepEqual(parseZaadMessageInput(message("あ".repeat(501), 1), true), {
    ok: false,
    code: ZAAD_ERROR_CODES.invalidRequest,
  });
});
