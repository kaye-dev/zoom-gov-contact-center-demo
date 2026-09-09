import assert from "node:assert/strict";
import test from "node:test";
import { type Availability } from "../lib/zaad/municipal/contracts";
import { inJstWindow, nextDueSlot } from "../lib/zaad/municipal/workflows";

const window: Availability = { weekdays: [0, 1, 2, 3, 4, 5, 6], windows: [{ start: "09:00", end: "17:00" }] };
test("JST schedule includes configured weekends, excludes exact closing and service deadline", () => {
  assert.equal(inJstWindow(new Date("2026-09-12T00:00:00Z"), window), true);
  assert.equal(inJstWindow(new Date("2026-09-12T08:00:00Z"), window), false);
  assert.equal(nextDueSlot(new Date("2026-09-12T08:00:00Z"), new Date("2026-09-13T00:00:00Z"), [window]), null);
  assert.equal(nextDueSlot(new Date("2026-09-12T08:00:00Z"), new Date("2026-09-13T01:00:00Z"), [window])?.toISOString(), "2026-09-13T00:00:00.000Z");
});
