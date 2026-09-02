import assert from "node:assert/strict";
import test from "node:test";

import {
  clearZaadZoomTokenCache,
  ZaadZoomClient,
  ZaadZoomError,
  type ZoomOneTimeCampaignProfile,
  type ZaadZoomWriteGates,
} from "../lib/server/zaad/zoom-client";
import { ZAAD_ERROR_CODES } from "../lib/zaad/contracts";

type ZaadZoomClientConstructor = new (
  credentials: { accountId: string; clientId: string; clientSecret: string; credentialVersion?: string },
  fetchImpl: typeof fetch,
  apiBase: string,
  tokenUrl: string,
  writeGates: ZaadZoomWriteGates,
) => ZaadZoomClient;

function client(fetchImpl: typeof fetch, writeGates: boolean | ZaadZoomWriteGates) {
  const Constructor = ZaadZoomClient as unknown as ZaadZoomClientConstructor;
  return new Constructor(
    { accountId: "account", clientId: "client", clientSecret: "secret" },
    fetchImpl,
    "https://api.zoom.test/v2",
    "https://zoom.test/oauth/token",
    typeof writeGates === "boolean"
      ? { contact: writeGates, tts: writeGates, campaign: writeGates }
      : writeGates,
  );
}

function clientAtVersion(fetchImpl: typeof fetch, credentialVersion: string) {
  const Constructor = ZaadZoomClient as unknown as ZaadZoomClientConstructor;
  return new Constructor(
    { accountId: "account", clientId: "client", clientSecret: "secret", credentialVersion },
    fetchImpl,
    "https://api.zoom.test/v2",
    "https://zoom.test/oauth/token",
    { contact: true, tts: true, campaign: true },
  );
}

type RecordedRequest = {
  method: string;
  url: URL;
  authorization: string | null;
  body: unknown;
};

const ttsInput = {
  name: "大雨警報のお知らせ",
  body: "未来市に大雨警報が発表されました。",
  languageCode: "ja-JP" as const,
  voiceId: "Tomoko" as const,
};

function referenceResponse(url: URL, input: {
  queueId?: string;
  queueListId?: string | null;
  queueDetailId?: string;
  queueListChannel?: string;
  queueDetailChannel?: string;
  flowId?: string;
  flowListId?: string | null;
  flowDetailId?: string;
  flowListChannel?: string;
  flowDetailChannel?: string;
  callerIds?: string[];
  distribution?: string;
  outboundEnabled?: boolean;
  flowStatus?: string;
} = {}) {
  const queueId = input.queueId ?? "queue-1";
  const flowId = input.flowId ?? "flow-new";
  if (url.pathname.endsWith("/contact_center/queues")) {
    const listId = input.queueListId === undefined ? queueId : input.queueListId;
    return Response.json({ queues: listId ? [{ cc_queue_id: listId, queue_name: "合成テストキュー", channel: input.queueListChannel ?? "voice" }] : [] });
  }
  if (url.pathname.endsWith(`/contact_center/queues/${queueId}`)) {
    return Response.json({
      cc_queue_id: input.queueDetailId ?? queueId,
      queue_name: "合成テストキュー",
      channel: input.queueDetailChannel ?? "voice",
      engagement_distribution: input.distribution ?? "longest_idle",
      outbound_settings: {
        enable_outbound_calls: input.outboundEnabled ?? true,
        queue_caller_ids: input.callerIds ?? ["+81300000000"],
      },
    });
  }
  if (url.pathname.endsWith("/contact_center/flows")) {
    const listId = input.flowListId === undefined ? flowId : input.flowListId;
    return Response.json({ flows: listId ? [{ flow_id: listId, flow_name: "合成テストフロー", channel: input.flowListChannel ?? "voice", status: input.flowStatus ?? "published" }] : [] });
  }
  if (url.pathname.endsWith(`/contact_center/flows/${flowId}`)) {
    return Response.json({ flow_id: input.flowDetailId ?? flowId, flow_name: "合成テストフロー", channel: input.flowDetailChannel ?? "voice", status: input.flowStatus ?? "published" });
  }
  return null;
}

test("Zoom mutations fail closed before OAuth when the write contract is unconfirmed", async () => {
  let fetchCount = 0;
  const zoom = client((async () => {
    fetchCount += 1;
    throw new Error("fetch must not run");
  }) as typeof fetch, false);

  await assert.rejects(
    zoom.createContactList({ name: "防災連絡先", description: "test" }),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomContractUnconfirmed);
      assert.equal(error.httpStatus, 503);
      assert.equal(error.resultUnknown, false);
      return true;
    },
  );
  await assert.rejects(
    zoom.createTtsAsset(ttsInput),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomContractUnconfirmed);
      return true;
    },
  );
  assert.equal(fetchCount, 0);
});

test("one-time campaign creation remains disabled when the write contract is unconfirmed", async () => {
  let fetchCount = 0;
  const zoom = client((async () => {
    fetchCount += 1;
    throw new Error("fetch must not run");
  }) as typeof fetch, false);

  await assert.rejects(zoom.createDraftOneTimeCampaign({
    name: "ZAAD-OT-synthetic",
    profile: {} as ZoomOneTimeCampaignProfile,
    contactListId: "temporary-list",
  }), (error: unknown) => {
    assert.ok(error instanceof ZaadZoomError);
    assert.equal(error.code, ZAAD_ERROR_CODES.zoomContractUnconfirmed);
    assert.equal(error.httpStatus, 503);
    return true;
  });
  assert.equal(fetchCount, 0);
});

test("contact, TTS, and campaign write gates cannot enable one another", async () => {
  const disabledOperations = [
    {
      gates: { contact: true, tts: false, campaign: false },
      operations: [
        (zoom: ZaadZoomClient) => zoom.createTtsAsset(ttsInput),
        (zoom: ZaadZoomClient) => zoom.createDraftOneTimeCampaign({
          name: "ZAAD-OT-synthetic",
          profile: {} as ZoomOneTimeCampaignProfile,
          contactListId: "temporary-list",
        }),
      ],
    },
    {
      gates: { contact: false, tts: true, campaign: false },
      operations: [
        (zoom: ZaadZoomClient) => zoom.createContactList({ name: "防災連絡先", description: "test" }),
        (zoom: ZaadZoomClient) => zoom.createDraftOneTimeCampaign({
          name: "ZAAD-OT-synthetic",
          profile: {} as ZoomOneTimeCampaignProfile,
          contactListId: "temporary-list",
        }),
      ],
    },
    {
      gates: { contact: false, tts: false, campaign: true },
      operations: [
        (zoom: ZaadZoomClient) => zoom.createContactList({ name: "防災連絡先", description: "test" }),
        (zoom: ZaadZoomClient) => zoom.createTtsAsset(ttsInput),
      ],
    },
  ] satisfies Array<{
    gates: ZaadZoomWriteGates;
    operations: Array<(zoom: ZaadZoomClient) => Promise<unknown>>;
  }>;

  for (const scenario of disabledOperations) {
    let fetchCount = 0;
    const zoom = client((async () => {
      fetchCount += 1;
      throw new Error("fetch must not run");
    }) as typeof fetch, scenario.gates);
    for (const operation of scenario.operations) {
      await assert.rejects(operation(zoom), (error: unknown) => {
        assert.ok(error instanceof ZaadZoomError);
        assert.equal(error.code, ZAAD_ERROR_CODES.zoomContractUnconfirmed);
        return true;
      });
    }
    assert.equal(fetchCount, 0);
  }
});

test("one-time preparation requires every feature-specific write gate before OAuth", () => {
  for (const gates of [
    { contact: false, tts: true, campaign: true },
    { contact: true, tts: false, campaign: true },
    { contact: true, tts: true, campaign: false },
  ] satisfies ZaadZoomWriteGates[]) {
    let fetchCount = 0;
    const zoom = client((async () => {
      fetchCount += 1;
      throw new Error("fetch must not run");
    }) as typeof fetch, gates);
    assert.throws(() => zoom.assertOneTimePreparationWritesEnabled(), (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomContractUnconfirmed);
      return true;
    });
    assert.equal(fetchCount, 0);
  }

  const confirmed = client((async () => {
    throw new Error("fetch must not run");
  }) as typeof fetch, { contact: true, tts: true, campaign: true });
  assert.doesNotThrow(() => confirmed.assertOneTimePreparationWritesEnabled());
});

test("TTS writes reject content above the configured local boundary before OAuth", async () => {
  let fetchCount = 0;
  const zoom = client((async () => {
    fetchCount += 1;
    throw new Error("fetch must not run");
  }) as typeof fetch, { contact: false, tts: true, campaign: false });
  const overBoundary = { ...ttsInput, body: "あ".repeat(501) };

  for (const operation of [
    () => zoom.createTtsAsset(overBoundary),
    () => zoom.updateTtsAsset("asset-1", "asset-item-1", overBoundary),
  ]) {
    await assert.rejects(operation(), (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.invalidRequest);
      assert.equal(error.httpStatus, 400);
      assert.equal(error.resultUnknown, false);
      return true;
    });
  }
  assert.equal(fetchCount, 0);
});

test("TTS boundary counts supplementary Unicode characters as one character", async () => {
  clearZaadZoomTokenCache();
  let apiRequests = 0;
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    apiRequests += 1;
    return Response.json({
      asset_id: "asset-emoji",
      asset_type: "audio",
      asset_items: [{ asset_item_id: "asset-item-emoji" }],
    }, { status: 201 });
  }) as typeof fetch, { contact: false, tts: true, campaign: false });

  await assert.doesNotReject(zoom.createTtsAsset({
    ...ttsInput,
    body: "🚨".repeat(500),
  }));
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("TTS asset CRUD uses the official create, item-update, and two-stage delete contracts", async () => {
  clearZaadZoomTokenCache();
  const requests: Array<{
    method: string;
    url: URL;
    contentType: string | null;
    form: Record<string, FormDataEntryValue> | null;
    json: unknown;
  }> = [];
  const assetPayload = {
    asset_id: "asset-1",
    asset_name: ttsInput.name,
    asset_type: "audio",
    asset_items: [{
      asset_item_id: "asset-item-1",
      asset_item_name: ttsInput.name,
      asset_item_language: ttsInput.languageCode,
      asset_item_content: ttsInput.body,
      asset_item_voice: ttsInput.voiceId,
      is_default: true,
    }],
  };
  const zoom = client((async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    const method = init?.method ?? "GET";
    const body = init?.body;
    requests.push({
      method,
      url,
      contentType: new Headers(init?.headers).get("content-type"),
      form: body instanceof FormData ? Object.fromEntries(body.entries()) : null,
      json: typeof body === "string" ? JSON.parse(body) as unknown : null,
    });
    if (method === "POST") return Response.json(assetPayload, { status: 201 });
    if (method === "PATCH" && url.pathname.endsWith("/assets/items")) {
      return Response.json({
        succeeded_assets: [{ asset_id: "asset-1", asset_item_language: "ja-JP" }],
        failed_assets: [],
      });
    }
    if (method === "PATCH" && url.pathname.endsWith("/assets/asset-1")) {
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") return new Response(null, { status: 404 });
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch, true);

  assert.deepEqual(await zoom.createTtsAsset(ttsInput), {
    assetId: "asset-1",
    assetItemId: "asset-item-1",
  });
  assert.deepEqual(await zoom.updateTtsAsset("asset-1", "asset-item-1", ttsInput), {
    assetId: "asset-1",
    assetItemId: "asset-item-1",
  });
  await zoom.deleteTtsAsset("asset-1");

  assert.deepEqual(requests.map(({ method, url }) => [method, url.pathname]), [
    ["POST", "/v2/contact_center/asset_library/assets"],
    ["PATCH", "/v2/contact_center/asset_library/assets/items"],
    ["PATCH", "/v2/contact_center/asset_library/assets/asset-1"],
    ["DELETE", "/v2/contact_center/asset_library/assets/asset-1"],
    ["DELETE", "/v2/contact_center/asset_library/assets/asset-1"],
  ]);
  assert.equal(requests[0]?.contentType, null);
  assert.equal(requests[1]?.contentType, "application/json");
  assert.equal(requests[2]?.contentType, null);
  assert.equal(requests[3]?.contentType, null);
  assert.equal(requests[4]?.contentType, null);
  assert.equal(requests[3]?.url.searchParams.get("archive"), "true");
  assert.equal(requests[4]?.url.searchParams.get("archive"), "false");
  assert.deepEqual(requests[0]?.form, {
    asset_name: ttsInput.name,
    asset_description: "ZAAD TTS message",
    asset_type: "audio",
    asset_items: JSON.stringify([{
      asset_item_name: ttsInput.name,
      asset_item_language: ttsInput.languageCode,
      asset_item_content: ttsInput.body,
      asset_item_voice: ttsInput.voiceId,
      is_default: true,
    }]),
  });
  assert.equal(requests[1]?.form, null);
  assert.deepEqual(requests[1]?.json, {
    items: [{
      asset_id: "asset-1",
      asset_item_language: ttsInput.languageCode,
      asset_item_name: ttsInput.name,
      asset_item_content: ttsInput.body,
      asset_item_voice: ttsInput.voiceId,
    }],
  });
  assert.deepEqual(requests[2]?.form, { asset_name: ttsInput.name });
  clearZaadZoomTokenCache();
});

test("TTS update is result-unknown when item update succeeds but asset-name update fails", async () => {
  clearZaadZoomTokenCache();
  let itemUpdates = 0;
  let nameUpdates = 0;
  const zoom = client((async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    if (url.pathname.endsWith("/assets/items")) {
      itemUpdates += 1;
      return Response.json({
        succeeded_assets: [{ asset_id: "asset-1", asset_item_language: "ja-JP" }],
        failed_assets: [],
      });
    }
    if (url.pathname.endsWith("/assets/asset-1") && init?.method === "PATCH") {
      nameUpdates += 1;
      return new Response(null, { status: 403 });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch, true);

  await assert.rejects(
    zoom.updateTtsAsset("asset-1", "asset-item-1", ttsInput),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomResultUnknown);
      assert.equal(error.resultUnknown, true);
      return true;
    },
  );
  assert.equal(itemUpdates, 1);
  assert.equal(nameUpdates, 1);
  clearZaadZoomTokenCache();
});

test("a successful TTS POST without both Zoom IDs is result-unknown and is never retried", async () => {
  clearZaadZoomTokenCache();
  let apiRequests = 0;
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    apiRequests += 1;
    return Response.json({ asset_id: "asset-1", asset_type: "audio", asset_items: [] }, { status: 201 });
  }) as typeof fetch, true);

  await assert.rejects(zoom.createTtsAsset(ttsInput), (error: unknown) => {
    assert.ok(error instanceof ZaadZoomError);
    assert.equal(error.code, ZAAD_ERROR_CODES.zoomResultUnknown);
    assert.equal(error.resultUnknown, true);
    return true;
  });
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("TTS item update rejects malformed batch results as result-unknown", async () => {
  clearZaadZoomTokenCache();
  let apiRequests = 0;
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    apiRequests += 1;
    return Response.json({ succeeded_assets: [], failed_assets: [] });
  }) as typeof fetch, true);

  await assert.rejects(
    zoom.updateTtsAsset("asset-1", "asset-item-1", ttsInput),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomResultUnknown);
      assert.equal(error.resultUnknown, true);
      return true;
    },
  );
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("TTS item update maps an explicit missing item result to a known not-found failure", async () => {
  clearZaadZoomTokenCache();
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    return Response.json({
      succeeded_assets: [],
      failed_assets: [{
        asset_id: "asset-1",
        asset_item_language: "ja-JP",
        error_code: 10026,
        error_message: "synthetic missing item",
      }],
    });
  }) as typeof fetch, true);

  await assert.rejects(
    zoom.updateTtsAsset("asset-1", "asset-item-1", ttsInput),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomNotFound);
      assert.equal(error.resultUnknown, false);
      return true;
    },
  );
  clearZaadZoomTokenCache();
});

test("a write transport failure is result-unknown and is never retried", async () => {
  clearZaadZoomTokenCache();
  let tokenRequests = 0;
  let apiRequests = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://zoom.test/oauth/token")) {
      tokenRequests += 1;
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    apiRequests += 1;
    throw new Error("connection reset after request transmission");
  };
  const zoom = client(fetchImpl, true);

  await assert.rejects(
    zoom.createContactList({ name: "防災連絡先", description: "test" }),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomUnavailable);
      assert.equal(error.resultUnknown, true);
      return true;
    },
  );
  assert.equal(tokenRequests, 1);
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("a successful contact POST without a contact ID is result-unknown and is never retried", async () => {
  clearZaadZoomTokenCache();
  let apiRequests = 0;
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    apiRequests += 1;
    return Response.json({}, { status: 201 });
  }) as typeof fetch, true);

  await assert.rejects(
    zoom.createContact("list-1", {
      name: "住民 1",
      phone: "+819000000001",
      email: "resident1@example.jp",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomResultUnknown);
      assert.equal(error.resultUnknown, true);
      return true;
    },
  );
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("an explicit Zoom write rejection is a known failure and is never retried", async () => {
  clearZaadZoomTokenCache();
  let apiRequests = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://zoom.test/oauth/token")) {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    apiRequests += 1;
    return new Response(null, { status: 403 });
  };
  const zoom = client(fetchImpl, true);

  await assert.rejects(
    zoom.createContactList({ name: "防災連絡先", description: "test" }),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomScopeRequired);
      assert.equal(error.resultUnknown, false);
      return true;
    },
  );
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("write 5xx is result-unknown while GET 5xx remains a known unavailable result", async () => {
  clearZaadZoomTokenCache();
  let writeApiRequests = 0;
  const writeZoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    writeApiRequests += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch, true);
  const contact = {
    name: "住民 1",
    phone: "+819000000001",
    email: "resident1@example.jp",
  };
  for (const operation of [
    () => writeZoom.createContact("list-1", contact),
    () => writeZoom.updateContact("list-1", "contact-1", contact),
    () => writeZoom.deleteContact("list-1", "contact-1"),
  ]) {
    await assert.rejects(operation(), (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomUnavailable);
      assert.equal(error.resultUnknown, true);
      return true;
    });
  }
  assert.equal(writeApiRequests, 3);

  clearZaadZoomTokenCache();
  let getApiRequests = 0;
  const getZoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    getApiRequests += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch, true);
  await assert.rejects(getZoom.listContactLists(), (error: unknown) => {
    assert.ok(error instanceof ZaadZoomError);
    assert.equal(error.code, ZAAD_ERROR_CODES.zoomUnavailable);
    assert.equal(error.resultUnknown, false);
    return true;
  });
  assert.equal(getApiRequests, 2);
  clearZaadZoomTokenCache();
});

test("OAuth 5xx occurs before a write and remains a known unavailable failure", async () => {
  clearZaadZoomTokenCache();
  let tokenRequests = 0;
  let apiRequests = 0;
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      tokenRequests += 1;
      return new Response(null, { status: 503 });
    }
    apiRequests += 1;
    return new Response(null, { status: 204 });
  }) as typeof fetch, true);

  await assert.rejects(
    zoom.deleteContactList("list-1"),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomUnavailable);
      assert.equal(error.resultUnknown, false);
      return true;
    },
  );
  assert.equal(tokenRequests, 1);
  assert.equal(apiRequests, 0);
  clearZaadZoomTokenCache();
});

test("contact-list DELETE reports 404 while resident contact DELETE remains idempotent", async () => {
  clearZaadZoomTokenCache();
  const paths: string[] = [];
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    paths.push(url.pathname);
    return new Response(null, { status: 404 });
  }) as typeof fetch, true);

  await assert.rejects(zoom.deleteContactList("list-1"), (error: unknown) => {
    assert.ok(error instanceof ZaadZoomError);
    assert.equal(error.code, ZAAD_ERROR_CODES.zoomNotFound);
    assert.equal(error.resultUnknown, false);
    return true;
  });
  await zoom.deleteContact("list-1", "contact-1");
  assert.deepEqual(paths, [
    "/v2/contact_center/outbound_campaign/contact_lists/list-1",
    "/v2/contact_center/outbound_campaign/contact_lists/list-1/contacts/contact-1",
  ]);
  clearZaadZoomTokenCache();
});

test("S2S OAuth and outbound campaign contact-list requests follow the current Zoom contract", async () => {
  clearZaadZoomTokenCache();
  const requests: RecordedRequest[] = [];
  let contactsPage = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === "https://zoom.test" && url.pathname === "/oauth/token") {
      assert.equal(url.searchParams.get("grant_type"), "account_credentials");
      assert.equal(url.searchParams.get("account_id"), "account");
      assert.equal(new Headers(init?.headers).get("authorization"), `Basic ${Buffer.from("client:secret").toString("base64")}`);
      return Response.json({ access_token: "access-token", expires_in: 3600 });
    }
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : null;
    requests.push({
      method,
      url,
      authorization: new Headers(init?.headers).get("authorization"),
      body,
    });
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access-token");

    if (method === "GET" && url.pathname.endsWith("/contact_lists")) {
      return Response.json({
        next_page_token: "next-list-page",
        contact_lists: [{
          contact_list_id: "list-1",
          contact_list_name: "防災連絡先",
          contact_list_description: "住民向け",
          contacts_count: 12,
        }],
      });
    }
    if (method === "POST" && url.pathname.endsWith("/contact_lists")) {
      return Response.json({
        contact_list_id: "list-created",
        contact_list_name: "新規連絡先",
        contact_list_description: "説明",
        contacts_count: 0,
      }, { status: 201 });
    }
    if (method === "GET" && url.pathname.endsWith("/contacts")) {
      contactsPage += 1;
      return Response.json(contactsPage === 1 ? {
        next_page_token: "contacts-page-2",
        contacts: [{
          contact_id: "contact-1",
          contact_display_name: "山田 花子",
          contact_phones: [{ contact_phone_number: "+819012345678", contact_phone_type: "Main" }],
        }],
      } : {
        contacts: [{
          contact_id: "contact-2",
          contact_display_name: "佐藤 健",
          contact_phones: [{ contact_phone_number: "+818023456789", contact_phone_type: "Mobile" }],
        }],
      });
    }
    if (method === "POST" && url.pathname.endsWith("/contacts")) {
      return Response.json({ contact_id: "contact-created" }, { status: 201 });
    }
    if (method === "PATCH" && url.pathname.includes("/contacts/")) return new Response(null, { status: 204 });
    if (method === "DELETE" && url.pathname.includes("/contacts/")) return new Response(null, { status: 404 });
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  const zoom = client(fetchImpl, true);

  const page = await zoom.listContactLists({ pageSize: 25, nextPageToken: "opaque-list-token" });
  assert.deepEqual({
    ...page,
    lists: page.lists.map(({ id, name, description, type, contactCount, updatedAt }) => ({
      id,
      name,
      description,
      type,
      contactCount,
      updatedAt,
    })),
  }, {
    lists: [{
      id: "list-1",
      name: "防災連絡先",
      description: "住民向け",
      type: "contact",
      contactCount: 12,
      updatedAt: null,
    }],
    nextPageToken: "next-list-page",
  });
  assert.match(page.lists[0]?.revision ?? "", /^sha256:[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(page.lists[0]?.revision, "list-1");

  const createdList = await zoom.createContactList({ name: "新規連絡先", description: "説明" });
  assert.equal(createdList.id, "list-created");
  const contacts = await zoom.listContacts("list-1");
  assert.deepEqual(contacts.map(({ id, displayName, phones }) => ({ id, displayName, phones })), [
    { id: "contact-1", displayName: "山田 花子", phones: [{ number: "+819012345678", type: "Main" }] },
    { id: "contact-2", displayName: "佐藤 健", phones: [{ number: "+818023456789", type: "Mobile" }] },
  ]);
  assert.equal(await zoom.createContact("list-1", {
    name: "山田 花子",
    phone: "+819012345678",
    email: "hanako@example.jp",
  }), "contact-created");
  await zoom.updateContact("list-1", "contact-1", {
    name: "山田 花子",
    phone: "+819012345678",
    email: "hanako@example.jp",
  });
  await zoom.deleteContact("list-1", "contact-1");

  const listRequest = requests.find(({ method, url }) => method === "GET" && url.pathname.endsWith("/contact_lists"));
  assert.ok(listRequest);
  assert.equal(listRequest.url.pathname, "/v2/contact_center/outbound_campaign/contact_lists");
  assert.equal(listRequest.url.searchParams.get("contact_list_type"), "contact");
  assert.equal(listRequest.url.searchParams.get("page_size"), "25");
  assert.equal(listRequest.url.searchParams.get("next_page_token"), "opaque-list-token");
  const createListRequest = requests.find(({ method, url }) => method === "POST" && url.pathname.endsWith("/contact_lists"));
  assert.deepEqual(createListRequest?.body, {
    contact_list_name: "新規連絡先",
    contact_list_description: "説明",
    contact_list_type: "contact",
  });
  const createContactRequest = requests.find(({ method, url }) => method === "POST" && url.pathname.endsWith("/contacts"));
  assert.deepEqual(createContactRequest?.body, {
    contact_display_name: "山田 花子",
    contact_phones: [{ contact_phone_number: "+819012345678", contact_phone_type: "Main" }],
    contact_emails: ["hanako@example.jp"],
  });
  const updateContactRequest = requests.find(({ method, url }) => method === "PATCH" && url.pathname.endsWith("/contacts/contact-1"));
  assert.deepEqual(updateContactRequest?.body, createContactRequest?.body);
  assert.ok(requests.every(({ url }) => url.pathname.startsWith("/v2/contact_center/outbound_campaign/")));
  clearZaadZoomTokenCache();
});

test("contact-list revisions hash the complete safe snapshot and detect stale snapshots", async () => {
  clearZaadZoomTokenCache();
  let description = "初期説明";
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    return Response.json({
      contact_list_id: "list-stable",
      contact_list_name: "防災連絡先",
      contact_list_description: description,
      contact_list_type: "contact",
      contacts_count: 12,
    });
  };
  const zoom = client(fetchImpl, true);
  const first = await zoom.getContactList("list-stable");
  const same = await zoom.getContactList("list-stable");
  description = "更新後の説明";
  const changed = await zoom.getContactList("list-stable");

  assert.equal(first.revision, same.revision);
  assert.notEqual(first.revision, changed.revision);
  assert.notEqual(first.revision, first.id);
  clearZaadZoomTokenCache();
});

test("batch contact creation uses the official 100-item contract and maps failed string indices", async () => {
  clearZaadZoomTokenCache();
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    const reference = referenceResponse(url);
    if (reference) return reference;
    requests.push({
      method: init?.method ?? "GET",
      url,
      authorization: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : null,
    });
    return Response.json({ failed_contacts: [{ contact_index: "1", error: "synthetic raw rejection" }] });
  };
  const zoom = client(fetchImpl, true);
  const contacts = [
    { name: "住民 1", phone: "+819000000001", email: "resident1@example.jp" },
    { name: "住民 2", phone: "+819000000002", email: "resident2@example.jp" },
  ];
  assert.deepEqual(await zoom.createContactsBatch("list-1", contacts), [
    { success: true },
    { success: false, code: ZAAD_ERROR_CODES.zoomContactRejected },
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url.pathname, "/v2/contact_center/outbound_campaign/contact_lists/list-1/contacts/batch");
  assert.deepEqual(requests[0]?.body, {
    contacts: contacts.map((contact) => ({
      contact_display_name: contact.name,
      contact_phones: [{ contact_phone_number: contact.phone, contact_phone_type: "Main" }],
      contact_emails: [contact.email],
    })),
  });

  await assert.rejects(
    zoom.createContactsBatch("list-1", Array.from({ length: 101 }, (_, index) => ({
      name: `住民 ${index}`,
      phone: `+8190${String(index).padStart(8, "0")}`,
      email: `resident${index}@example.jp`,
    }))),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.invalidRequest);
      return true;
    },
  );
  assert.equal(requests.length, 1);
  clearZaadZoomTokenCache();
});

test("malformed batch failed_contacts are result-unknown and never retried", async () => {
  for (const failedContacts of [
    [{ contact_index: "01", error: "raw" }],
    [{ contact_index: "2", error: "raw" }],
    [{ contact_index: "0", error: "raw" }, { contact_index: "0", error: "raw" }],
    "invalid",
  ]) {
    clearZaadZoomTokenCache();
    let apiRequests = 0;
    const zoom = client((async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
      apiRequests += 1;
      return Response.json({ failed_contacts: failedContacts });
    }) as typeof fetch, true);
    await assert.rejects(
      zoom.createContactsBatch("list-1", [{
        name: "住民 1",
        phone: "+819000000001",
        email: "resident1@example.jp",
      }]),
      (error: unknown) => {
        assert.ok(error instanceof ZaadZoomError);
        assert.equal(error.code, ZAAD_ERROR_CODES.zoomResultUnknown);
        assert.equal(error.resultUnknown, true);
        return true;
      },
    );
    assert.equal(apiRequests, 1);
  }
  clearZaadZoomTokenCache();
});

test("campaign list, detail, and status use current Zoom fields and exact status body", async () => {
  clearZaadZoomTokenCache();
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    const reference = referenceResponse(url);
    if (reference) return reference;
    const method = init?.method ?? "GET";
    requests.push({
      method,
      url,
      authorization: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : null,
    });
    if (method === "GET" && url.pathname.endsWith("/campaigns")) {
      return Response.json({
        next_page_token: "campaign-page-2",
        outbound_campaign_items: [{
          outbound_campaign_id: "campaign-1",
          outbound_campaign_name: "大雨警報",
          outbound_campaign_status: "ready",
        }],
      });
    }
    if (method === "GET" && url.pathname.endsWith("/campaigns/campaign-1")) {
      return Response.json({
        outbound_campaign_id: "campaign-1",
        outbound_campaign_name: "大雨警報",
        outbound_campaign_status: "ready",
        dialing_method: "agentless",
        queue_name: "災害情報発信キュー",
        campaign_contact_list: [{
          contact_list_id: "list-1",
          contact_list_name: "防災連絡先",
          contacts_count: "342",
        }],
        dialing_method_settings: { max_concurrent_calls: 10 },
        business_hour_source: "queue",
        max_attempts_per_contact: 2,
        retry_period: 60,
        retry_period_unit: "minutes",
        campaign_do_not_contact_list: [{ contact_list_id: "dnc-1" }],
        enable_always_running: false,
      });
    }
    if (method === "PATCH" && url.pathname.endsWith("/campaigns/campaign-1/status")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  const zoom = client(fetchImpl, true);

  const page = await zoom.listCampaigns({ pageSize: 100 });
  assert.equal(page.campaigns[0]?.id, "campaign-1");
  assert.equal(page.campaigns[0]?.status, "ready");
  assert.equal(page.nextPageToken, "campaign-page-2");
  assert.equal(
    requests.find(({ method, url }) => method === "GET" && url.pathname.endsWith("/campaigns"))?.url.searchParams.get("page_size"),
    "10",
  );
  const detail = await zoom.getCampaign("campaign-1");
  assert.deepEqual({
    dialingMethod: detail.dialingMethod,
    contactListId: detail.contactListId,
    contactCount: detail.contactCount,
    maxConcurrentCalls: detail.maxConcurrentCalls,
    businessHours: detail.businessHours,
    retryPolicy: detail.retryPolicy,
    dncPolicy: detail.dncPolicy,
    alwaysRunning: detail.alwaysRunning,
  }, {
    dialingMethod: "agentless",
    contactListId: "list-1",
    contactCount: 342,
    maxConcurrentCalls: 10,
    businessHours: "queue",
    retryPolicy: "2 attempts / 60 minutes",
    dncPolicy: "1 list(s)",
    alwaysRunning: false,
  });
  await zoom.setCampaignStatus("campaign-1", "Running");
  const statusRequest = requests.find(({ method }) => method === "PATCH");
  assert.equal(statusRequest?.url.pathname, "/v2/contact_center/outbound_campaign/campaigns/campaign-1/status");
  assert.deepEqual(statusRequest?.body, { status: "Running" });
  clearZaadZoomTokenCache();
});

test("campaign preparation accepts only the base campaign's validated voice queue, flow, and caller", async () => {
  const baseCampaign = {
    outbound_campaign_id: "base-campaign",
    outbound_campaign_name: "合成テスト参照元",
    outbound_campaign_status: "ready",
    dialing_method: "agentless",
    queue_id: "queue-1",
    phone_number_id: "opaque-phone-id",
    outbound_number: "+81300000000",
    dialing_method_settings: { max_concurrent_calls: 1, new_flow_id: "flow-new" },
    enable_always_running: false,
  };
  const scenarios: Array<{
    name: string;
    references: Parameters<typeof referenceResponse>[1];
  }> = [
    { name: "queue missing from list", references: { queueListId: null } },
    { name: "queue list is not voice", references: { queueListChannel: "video" } },
    { name: "queue list/detail ID drift", references: { queueDetailId: "different-queue" } },
    { name: "queue is not voice", references: { queueDetailChannel: "video" } },
    { name: "queue outbound is disabled", references: { outboundEnabled: false } },
    { name: "queue distribution is simultaneous", references: { distribution: "simultaneous" } },
    { name: "queue distribution is manual", references: { distribution: "manual" } },
    { name: "queue distribution is unknown", references: { distribution: "future_mode" } },
    { name: "queue has no caller", references: { callerIds: [] } },
    { name: "queue caller is not E.164", references: { callerIds: ["03-0000-0000"] } },
    { name: "opaque campaign caller cannot select among multiple queue callers", references: { callerIds: ["+81311111111", "+81322222222"] } },
    { name: "flow missing from list", references: { flowListId: null } },
    { name: "flow list is not voice", references: { flowListChannel: "video" } },
    { name: "flow list/detail ID drift", references: { flowDetailId: "different-flow" } },
    { name: "flow is not voice", references: { flowDetailChannel: "video" } },
    { name: "flow is not published", references: { flowStatus: "draft" } },
  ];

  for (const scenario of scenarios) {
    clearZaadZoomTokenCache();
    const apiWrites: string[] = [];
    const zoom = client((async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
      const method = init?.method ?? "GET";
      if (method !== "GET") apiWrites.push(`${method} ${url.pathname}`);
      if (url.pathname.endsWith("/campaigns/base-campaign")) return Response.json(baseCampaign);
      const reference = referenceResponse(url, scenario.references);
      if (reference) return reference;
      throw new Error(`Unexpected request: ${method} ${url}`);
    }) as typeof fetch, false);

    await assert.rejects(zoom.getCampaignPreparationProfile("base-campaign"), (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError, scenario.name);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomInvalidResponse, scenario.name);
      return true;
    });
    assert.deepEqual(apiWrites, [], scenario.name);
  }

  clearZaadZoomTokenCache();
  const requested: string[] = [];
  const zoom = client((async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    requested.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/campaigns/base-campaign")) return Response.json(baseCampaign);
    const reference = referenceResponse(url);
    if (reference) return reference;
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch, false);
  const resolved = await zoom.getCampaignPreparationProfile("base-campaign");
  assert.equal(resolved.profile.phoneNumberId, "+81300000000");
  assert.equal(resolved.campaign.queueName, "合成テストキュー");
  assert.equal(resolved.campaign.callerIdMasked, "***-***-0000");
  assert.deepEqual(requested, [
    "GET /v2/contact_center/outbound_campaign/campaigns/base-campaign",
    "GET /v2/contact_center/queues?channel=voice&page_size=100",
    "GET /v2/contact_center/queues/queue-1?queue_identifier_type=id",
    "GET /v2/contact_center/flows?status=published&channel=voice&page_size=100",
    "GET /v2/contact_center/flows/flow-new?flow_identifier_type=id",
  ]);
  clearZaadZoomTokenCache();
});

test("one-time campaign preparation clones only the allowlisted Agentless profile and never starts it", async () => {
  clearZaadZoomTokenCache();
  const requests: RecordedRequest[] = [];
  const baseCampaign = {
    outbound_campaign_id: "base-campaign",
    outbound_campaign_name: "合成テスト参照元",
    outbound_campaign_status: "ready",
    dialing_method: "agentless",
    queue_id: "queue-1",
    queue_name: "合成テストキュー",
    phone_number_id: "phone-1",
    outbound_number: "+81300000000",
    assign_type: "queue",
    dialing_method_settings: {
      max_concurrent_calls: 3,
      new_flow_id: "flow-new",
      old_flow_id: "flow-old",
      agentless_amd_off_action: "useFlow",
      agentless_amd_off_resource_id: "base-private-resource",
    },
    outbound_campaign_priority: 2,
    campaign_do_not_contact_list: [{ contact_list_id: "dnc-1" }],
    exclusion_logic: "and",
    max_attempts_per_contact: 2,
    attempts_use_same_period: true,
    retry_period: 30,
    retry_period_unit: "minutes",
    dial_sequence: "list_dial",
    enable_max_ring_time: true,
    max_ring_time: 30,
    business_hour_source: "queue",
    enable_closure_hour: false,
    contact_timezone_source: "none",
    contact_phone_order: "1,2,3,4,5",
    enable_always_running: false,
    enable_diagnostics: false,
  };
  const createdCampaign = {
    ...baseCampaign,
    outbound_campaign_id: "one-time-campaign",
    outbound_campaign_name: "ZAAD-OT-test",
    outbound_campaign_status: "draft",
    phone_number_id: "canonical-phone-1",
    campaign_contact_list: [{ contact_list_id: "temporary-list", contact_list_name: "ZAAD temporary" }],
    dialing_method_settings: {
      ...baseCampaign.dialing_method_settings,
      agentless_amd_off_action: "playMedia",
      agentless_amd_off_resource_id: "one-time-asset",
    },
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    const reference = referenceResponse(url);
    if (reference) return reference;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : null;
    requests.push({ method, url, authorization: new Headers(init?.headers).get("authorization"), body });
    if (method === "GET" && url.pathname.endsWith("/campaigns/base-campaign")) return Response.json(baseCampaign);
    if (method === "POST" && url.pathname.endsWith("/campaigns")) {
      return Response.json({ outbound_campaign_id: "one-time-campaign" }, { status: 201 });
    }
    if (method === "PATCH" && url.pathname.endsWith("/campaigns/one-time-campaign")) {
      return new Response(null, { status: 204 });
    }
    if (method === "GET" && url.pathname.endsWith("/campaigns/one-time-campaign")) {
      return Response.json(createdCampaign);
    }
    if (method === "PATCH" && url.pathname.endsWith("/campaigns/one-time-campaign/status")) {
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE" && url.pathname.endsWith("/campaigns/one-time-campaign")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  const zoom = client(fetchImpl, true);
  const preparation = await zoom.getCampaignPreparationProfile("base-campaign");
  assert.equal(preparation.campaign.callerIdMasked, "***-***-0000");
  assert.deepEqual(preparation.profile, {
    queueId: "queue-1",
    phoneNumberId: "+81300000000",
    assignType: "queue",
    maxConcurrentCalls: 3,
    newFlowId: "flow-new",
    oldFlowId: "flow-old",
    outboundCampaignPriority: 2,
    dncListIds: ["dnc-1"],
    exclusionLogic: "and",
    maxAttemptsPerContact: 2,
    attemptsUseSamePeriod: true,
    secondAttemptPeriod: null,
    thirdAttemptPeriod: null,
    otherAttemptPeriod: null,
    retryPeriod: 30,
    retryPeriodUnit: "minutes",
    dialSequence: "list_dial",
    enableMaxRingTime: true,
    maxRingTime: 30,
    businessHourSource: "queue",
    businessHourId: null,
    enableClosureHour: false,
    closureSetId: null,
    contactTimezoneSource: "none",
    contactPhoneOrder: "1,2,3,4,5",
    enableDiagnostics: false,
    localCallingWindows: [],
  });

  const campaignId = await zoom.createDraftOneTimeCampaign({
    name: "ZAAD-OT-test",
    profile: preparation.profile,
    contactListId: "temporary-list",
  });
  assert.equal(campaignId, "one-time-campaign");
  await zoom.configureDraftOneTimeCampaign(campaignId, {
    profile: preparation.profile,
    assetId: "one-time-asset",
  });
  assert.deepEqual(await zoom.getOneTimeCampaignReadback(campaignId), {
    id: "one-time-campaign",
    dialingMethod: "agentless",
    status: "draft",
    contactListId: "temporary-list",
    agentlessAmdOffAction: "play_media",
    assetId: "one-time-asset",
    alwaysRunning: false,
    queueId: "queue-1",
    phoneNumberId: "canonical-phone-1",
    newFlowId: "flow-new",
  });
  await zoom.setCampaignStatus(campaignId, "Ready");
  await zoom.deleteCampaign(campaignId);

  const createRequest = requests.find(({ method, url }) => method === "POST" && url.pathname.endsWith("/campaigns"));
  assert.deepEqual(createRequest?.body, {
    outbound_campaign_name: "ZAAD-OT-test",
    outbound_campaign_description: "ZAAD one-time dispatch",
    queue_id: "queue-1",
    phone_number_id: "+81300000000",
    assign_type: "queue",
    dialing_method: "agentless",
    dialing_method_settings: {
      max_concurrent_calls: 3,
      new_flow_id: "flow-new",
      old_flow_id: "flow-old",
      agentless_amd_off_action: "hangUp",
    },
    campaign_contact_list_ids: ["temporary-list"],
    outbound_campaign_priority: 2,
    campaign_do_not_contact_list_ids: ["dnc-1"],
    exclusion_logic: "and",
    max_attempts_per_contact: 2,
    attempts_use_same_period: true,
    retry_period: 30,
    retry_period_unit: "minutes",
    dial_sequence: "list_dial",
    enable_max_ring_time: true,
    max_ring_time: 30,
    business_hour_source: "queue",
    enable_closure_hour: false,
    contact_timezone_source: "none",
    contact_phone_order: "1,2,3,4,5",
    enable_always_running: false,
    enable_diagnostics: false,
  });
  const configureRequest = requests.find(({ method, url }) => method === "PATCH" && url.pathname.endsWith("/campaigns/one-time-campaign"));
  assert.deepEqual(configureRequest?.body, {
    max_concurrent_calls: 3,
    new_flow_id: "flow-new",
    old_flow_id: "flow-old",
    agentless_amd_off_action: "play_media",
    agentless_amd_off_resource_id: "one-time-asset",
    enable_always_running: false,
  });
  const statusBodies = requests
    .filter(({ method, url }) => method === "PATCH" && url.pathname.endsWith("/status"))
    .map(({ body }) => body);
  assert.deepEqual(statusBodies, [{ status: "Ready" }]);
  assert.equal(JSON.stringify(requests).includes("Running"), false);
  clearZaadZoomTokenCache();
});

test("one-time preparation accepts required raw settings without optional display metadata or DNC lists", async () => {
  clearZaadZoomTokenCache();
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    const reference = referenceResponse(url);
    if (reference) return reference;
    if (url.pathname.endsWith("/campaigns/base-campaign")) {
      return Response.json({
        outbound_campaign_id: "base-campaign",
        outbound_campaign_name: "合成テスト参照元",
        outbound_campaign_status: "ready",
        dialing_method: "agentless",
        queue_id: "queue-1",
        phone_number_id: "phone-1",
        dialing_method_settings: {
          max_concurrent_calls: 1,
          new_flow_id: "flow-new",
        },
        enable_always_running: false,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch, false);

  const preparation = await zoom.getCampaignPreparationProfile("base-campaign");

  assert.equal(preparation.campaign.queueName, "合成テストキュー");
  assert.equal(preparation.campaign.callerIdMasked, "***-***-0000");
  assert.equal(preparation.campaign.businessHours, null);
  assert.equal(preparation.campaign.retryPolicy, null);
  assert.equal(preparation.campaign.dncPolicy, "none");
  assert.deepEqual(preparation.profile.dncListIds, []);
  assert.equal(preparation.profile.maxConcurrentCalls, 1);
  clearZaadZoomTokenCache();
});

test("GET retries a rate limit once while writes remain single-attempt", async () => {
  clearZaadZoomTokenCache();
  let apiRequests = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    apiRequests += 1;
    if (apiRequests === 1) return new Response(null, { status: 429, headers: { "Retry-After": "0" } });
    return Response.json({ contact_lists: [] });
  };
  const zoom = client(fetchImpl, true);
  assert.deepEqual(await zoom.listContactLists(), { lists: [], nextPageToken: null });
  assert.equal(apiRequests, 2);
  clearZaadZoomTokenCache();
});

test("GET evicts a rejected access token and retries exactly once with a fresh token", async () => {
  clearZaadZoomTokenCache();
  let tokenRequests = 0;
  const apiTokens: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      tokenRequests += 1;
      return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 3600 });
    }
    const authorization = new Headers(init?.headers).get("authorization") ?? "";
    apiTokens.push(authorization);
    if (authorization === "Bearer token-1") return new Response(null, { status: 401 });
    return Response.json({ contact_lists: [] });
  };
  const zoom = client(fetchImpl, true);

  assert.deepEqual(await zoom.listContactLists(), { lists: [], nextPageToken: null });
  assert.equal(tokenRequests, 2);
  assert.deepEqual(apiTokens, ["Bearer token-1", "Bearer token-2"]);
  clearZaadZoomTokenCache();
});

test("a second GET 401 is a credential error distinct from missing configuration", async () => {
  clearZaadZoomTokenCache();
  let tokenRequests = 0;
  let apiRequests = 0;
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      tokenRequests += 1;
      return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 3600 });
    }
    apiRequests += 1;
    return new Response(null, { status: 401 });
  }) as typeof fetch, true);

  await assert.rejects(zoom.listContactLists(), (error: unknown) => {
    assert.ok(error instanceof ZaadZoomError);
    assert.equal(error.code, ZAAD_ERROR_CODES.zoomCredentialsInvalid);
    assert.notEqual(error.code, ZAAD_ERROR_CODES.zoomNotConfigured);
    return true;
  });
  assert.equal(tokenRequests, 2);
  assert.equal(apiRequests, 2);
  clearZaadZoomTokenCache();
});

test("write 401 evicts the token but never retries the write", async () => {
  clearZaadZoomTokenCache();
  let tokenRequests = 0;
  let apiRequests = 0;
  const zoom = client((async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      tokenRequests += 1;
      return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 3600 });
    }
    apiRequests += 1;
    return new Response(null, { status: 401 });
  }) as typeof fetch, true);

  await assert.rejects(
    zoom.createContactList({ name: "防災連絡先", description: "test" }),
    (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomCredentialsInvalid);
      assert.equal(error.resultUnknown, false);
      return true;
    },
  );
  assert.equal(tokenRequests, 1);
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("contact pagination rejects repeated tokens and an overlarge page chain", async () => {
  for (const mode of ["cycle", "overlarge"] as const) {
    clearZaadZoomTokenCache();
    let apiRequests = 0;
    const zoom = client((async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
      apiRequests += 1;
      return Response.json({
        contacts: [],
        next_page_token: mode === "cycle" ? "cycle-token" : `page-${apiRequests}`,
      });
    }) as typeof fetch, true);

    await assert.rejects(zoom.listContacts("list-1"), (error: unknown) => {
      assert.ok(error instanceof ZaadZoomError);
      assert.equal(error.code, ZAAD_ERROR_CODES.zoomInvalidResponse);
      return true;
    });
    assert.equal(apiRequests, mode === "cycle" ? 2 : 100);
  }
  clearZaadZoomTokenCache();
});

test("credential update version invalidates the in-memory OAuth token cache", async () => {
  clearZaadZoomTokenCache();
  let tokenRequests = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      tokenRequests += 1;
      return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 3600 });
    }
    return Response.json({ contact_lists: [] });
  };

  await clientAtVersion(fetchImpl, "2026-09-01T00:00:00.000Z").listContactLists();
  await clientAtVersion(fetchImpl, "2026-09-01T00:01:00.000Z").listContactLists();
  assert.equal(tokenRequests, 2);
  clearZaadZoomTokenCache();
});
