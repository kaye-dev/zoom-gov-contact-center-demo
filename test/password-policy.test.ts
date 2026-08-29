import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATED_TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from "../lib/password-policy";

test("temporary passwords contain every required character group", () => {
  const password = generateTemporaryPassword(() => 0);

  assert.equal(password.length, GENERATED_TEMPORARY_PASSWORD_LENGTH);
  assert.match(password, /[A-HJ-NP-Z]/u);
  assert.match(password, /[a-km-z]/u);
  assert.match(password, /[2-9]/u);
  assert.match(password, /[!@#$%^&*]/u);
  assert.doesNotMatch(password, /[01IOl]/u);
});

test("temporary password generation uses the supplied random indexes", () => {
  let call = 0;
  const password = generateTemporaryPassword((maxExclusive) => {
    const index = call % maxExclusive;
    call += 1;
    return index;
  });

  assert.equal(password.length, GENERATED_TEMPORARY_PASSWORD_LENGTH);
  assert.ok(call > GENERATED_TEMPORARY_PASSWORD_LENGTH);
});
