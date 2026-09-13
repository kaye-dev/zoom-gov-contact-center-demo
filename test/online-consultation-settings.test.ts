import assert from "node:assert/strict";
import test from "node:test";

import {
  ONLINE_CONSULTATION_ERROR_CODES,
  parseOnlineConsultationSettings,
  parseVideoClientWebTag,
} from "../lib/online-consultation-settings";

const tag =
  '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/video-client.js" data-entry-id="entry-test" data-env="us01" data-apikey="public-test-key"></script>';

test("online consultation accepts only official Zoom HTTPS script tags", () => {
  assert.equal(parseVideoClientWebTag(tag), tag);
  assert.equal(
    parseVideoClientWebTag('<script src="https://example.com/client.js"></script>'),
    null,
  );
  assert.equal(
    parseVideoClientWebTag(
      '<script src="https://zoom.us/client.js"></script><img src=x onerror=alert(1)>',
    ),
    null,
  );
});

test("online consultation requires one valid tag for every university service", () => {
  const parsed = parseOnlineConsultationSettings({
    services: [
      { serviceKey: "admissions", webClientTag: tag },
      { serviceKey: "student-support", webClientTag: tag },
      { serviceKey: "careers", webClientTag: tag },
    ],
  });
  assert.equal(parsed.ok, true);

  assert.deepEqual(
    parseOnlineConsultationSettings({
      services: [
        { serviceKey: "admissions", webClientTag: tag },
        { serviceKey: "admissions", webClientTag: tag },
        { serviceKey: "careers", webClientTag: tag },
      ],
    }),
    { ok: false, code: ONLINE_CONSULTATION_ERROR_CODES.invalidTag },
  );
});
