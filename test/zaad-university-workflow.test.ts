import assert from "node:assert/strict";
import test from "node:test";
import {
  CASES,
  GENERIC_VOICEMAIL,
  recipientsFor,
} from "../lib/zaad/university/demo";
import {
  PURPOSES,
  parseConfig,
  parseAnswers,
  classify,
  staffSummary,
  groupSummary,
  rate,
  OutreachError,
} from "../lib/zaad/university/contracts";
import { universityTemplatePhrases } from "../app/i18n/university-outreach-templates";
test("ALL-TEMPLATES: seven independent inputs, questions and completion criteria", () => {
  assert.deepEqual(
    CASES.map((t) => t.id),
    [...PURPOSES],
  );
  for (const template of CASES) {
    assert.ok(template.questions.length >= 3);
    assert.ok(recipientsFor(template.id).length);
    assert.doesNotThrow(() =>
      parseConfig(
        template.id,
        Object.fromEntries(
          template.fields.map(([key, , value]) => [key, value]),
        ),
      ),
    );
    for (const locale of ["ja", "en", "zh-Hans", "zh-Hant", "ko"] as const) {
      const texts = [
        template.name,
        template.audience,
        template.trigger,
        template.purpose,
        template.completion,
        ...template.fields.map(([, label]) => label),
        ...template.questions.flatMap(([, question, options]) => [
          question,
          options,
        ]),
        ...template.answerColumns.map(([, label]) => label),
      ];
      for (const text of texts)
        assert.ok(
          universityTemplatePhrases[locale][text],
          `${locale}: ${text}`,
        );
    }
  }
});
test("SCHOLARSHIP-LIFECYCLE: connection, acknowledgment, response and completion are distinct", () => {
  const rows = recipientsFor("scholarship").filter((r) => r.eligible);
  assert.equal(rows.length, 8);
  assert.equal(
    rows.filter((r) => ["HUMAN", "VOICEMAIL"].includes(r.call)).length,
    6,
  );
  assert.equal(
    rows.filter((r) => r.confirmed && r.recognized && r.call === "HUMAN")
      .length,
    4,
  );
  assert.equal(rows.filter((r) => classify(r) === "unconfirmed").length, 4);
  assert.equal(rows.filter((r) => classify(r) === "planned").length, 2);
  assert.equal(rows.filter((r) => r.answers.consultation === true).length, 1);
  assert.equal(rows.filter((r) => r.answers.resend === true).length, 1);
  for (const call of ["VOICEMAIL", "NO_ANSWER", "UNKNOWN"] as const)
    assert.equal(
      classify({
        call,
        confirmed: true,
        recognized: true,
        answers: { consultation: true },
      }),
      "unconfirmed",
    );
});
test("STAFF-SHORTAGE: late arrivals do not count and reserves do not add respondents", () => {
  const rows = recipientsFor("staff");
  const config = { arrivalDeadline: "09:00", venueA: "3", venueB: "2" };
  assert.deepEqual(
    staffSummary(rows, config, []).map((r) => r.shortage),
    [1, 1],
  );
  assert.deepEqual(
    staffSummary(rows, config, [
      { id: "reserve-a", venue: "B会場" },
      { id: "reserve-a", venue: "B会場" },
    ]).map((r) => r.shortage),
    [1, 0],
  );
  assert.equal(rows.length, 6);
});
test("GROUP-DENOMINATOR: latest group answer and typed population are bounded", () => {
  const rows = recipientsFor("group");
  const expected = {
    respondents: 3,
    representatives: 4,
    population: 48,
    covered: 40,
    assembled: 37,
    delayed: 3,
    unknown: 8,
  };
  assert.deepEqual(groupSummary(rows), expected);
  assert.deepEqual(groupSummary([...rows, structuredClone(rows[0])]), expected);
  assert.throws(
    () =>
      parseAnswers("group", { memberCount: 10, assembled: 9, delayed: 2 }, 10),
    OutreachError,
  );
  assert.throws(
    () =>
      parseAnswers(
        "group",
        { memberCount: 10, assembled: "9", delayed: 0 },
        10,
      ),
    OutreachError,
  );
  assert.deepEqual(
    parseAnswers(
      "group",
      { memberCount: 10, assembled: 9, delayed: 1, support: true },
      10,
    ),
    { memberCount: 10, assembled: 9, delayed: 1, support: true },
  );
});
test("TYPED-ANSWERS/VOICEMAIL-PRIVACY/METRICS: no inferred flags, private voicemail or zero-denominator success", () => {
  assert.throws(
    () => parseAnswers("scholarship", { consultation: "true" }, 1),
    OutreachError,
  );
  assert.deepEqual(
    parseAnswers("scholarship", { consultation: true, resend: true }, 1),
    { consultation: true, resend: true },
  );
  assert.throws(
    () => parseAnswers("staff", { arrival: "25:61" }, 1),
    OutreachError,
  );
  assert.throws(
    () => parseAnswers("staff", { arrival: "09:00", unknown: true }, 1),
    OutreachError,
  );
  assert.doesNotMatch(GENERIC_VOICEMAIL, /奨学金|経済|減免|支援対象|手続/);
  assert.equal(rate(0, 0), null);
  assert.equal(rate(1, 8), 0.125);
});
