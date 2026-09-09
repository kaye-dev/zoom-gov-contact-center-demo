import test from 'node:test';
import assert from 'node:assert/strict';
import { ZoomOutreachProvider } from './helpers/zoom-outreach-provider';

const call = (provider: ZoomOutreachProvider, path: string, method = 'GET', body?: object) => provider.fetch(`${provider.apiBase}/contact_center/outbound_campaign/${path}`, { method, headers: { authorization: `Bearer fixture-${provider.accountId}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
test('provider snapshot preserves groups and members across restart without reusing deleted IDs', async () => {
  const original = new ZoomOutreachProvider('fixture-lg');
  const list = await (await call(original, 'contact_lists', 'POST', { name: 'Fixture group' })).json();
  const member = await (await call(original, `contact_lists/${list.contact_list_id}/contacts`, 'POST', { display_name: 'Fixture member', phones: [{ number: '+819000000001' }] })).json();
  const restored = new ZoomOutreachProvider('fixture-lg', original.snapshot());
  assert.deepEqual(await (await call(restored, 'contact_lists')).json(), await (await call(original, 'contact_lists')).json());
  assert.deepEqual(await (await call(restored, `contact_lists/${list.contact_list_id}/contacts`)).json(), await (await call(original, `contact_lists/${list.contact_list_id}/contacts`)).json());
  await call(restored, `contact_lists/${list.contact_list_id}/contacts/${member.contact_id}`, 'DELETE');
  const again = new ZoomOutreachProvider('fixture-lg', restored.snapshot());
  const next = await (await call(again, `contact_lists/${list.contact_list_id}/contacts`, 'POST', { display_name: 'New member' })).json();
  assert.notEqual(next.contact_id, member.contact_id);
  assert.throws(() => new ZoomOutreachProvider('fixture-univ', original.snapshot()), /account mismatch/);
});

test('fixture campaign inventory returns seeded real records while unsupported writes fail closed', async () => {
  const campaign = { outbound_campaign_id: 'fixture-campaign-a', outbound_campaign_name: 'Fixture campaign', dialing_method: 'agentless', outbound_campaign_status: 'Ready' };
  const provider = new ZoomOutreachProvider('fixture-lg', { accountId: 'fixture-lg', lists: [], members: {}, campaigns: [campaign] });
  assert.deepEqual((await (await call(provider, 'campaigns')).json()).campaigns, [campaign]);
  assert.deepEqual(await (await call(provider, 'campaigns/fixture-campaign-a')).json(), campaign);
  assert.equal((await call(provider, 'campaigns/missing')).status, 404);
  await assert.rejects(call(provider, 'campaigns/fixture-campaign-a/status', 'PATCH', { status: 'Running' }), /Unsupported/);
  await assert.rejects(provider.fetch('https://example.com'), /external origin/);
  const snapshot = provider.snapshot(); snapshot.campaigns[0].outbound_campaign_name = 'Changed copy';
  assert.equal((await (await call(provider, 'campaigns/fixture-campaign-a')).json()).outbound_campaign_name, 'Fixture campaign');
});

test('fixture pagination and bounded read failures survive a restart', async () => {
  const campaigns = ['a', 'b', 'c'].map(id => ({ outbound_campaign_id: `fixture-campaign-${id}`, outbound_campaign_name: id, dialing_method: 'agentless' }));
  const provider = new ZoomOutreachProvider('fixture-lg', { accountId: 'fixture-lg', lists: [], members: {}, campaigns, campaignPageSize: 2, readFailures: [{ path: '/v2/contact_center/outbound_campaign/campaigns/fixture-campaign-c', remaining: 2 }] });
  const first = await (await call(provider, 'campaigns')).json();
  assert.equal(first.campaigns.length, 2); assert.equal(first.next_page_token, 'fixture-page-2');
  const second = await (await call(provider, 'campaigns?next_page_token=fixture-page-2')).json();
  assert.equal(second.campaigns[0].outbound_campaign_id, 'fixture-campaign-c'); assert.equal(second.next_page_token, '');
  assert.equal((await call(provider, 'campaigns/fixture-campaign-c')).status, 503);
  const restarted = new ZoomOutreachProvider('fixture-lg', provider.snapshot());
  assert.equal((await call(restarted, 'campaigns/fixture-campaign-c')).status, 503);
  assert.equal((await call(restarted, 'campaigns/fixture-campaign-c')).status, 200);
});

test('fixture can fail post-save readback after allowing validation reads', async () => {
  const provider = new ZoomOutreachProvider('fixture-univ', { accountId: 'fixture-univ', lists: [], members: {}, campaigns: [{ outbound_campaign_id: 'fixture-campaign-a' }], readFailures: [{ path: '/v2/contact_center/outbound_campaign/campaigns/fixture-campaign-a', skip: 1, remaining: 2 }] });
  assert.equal((await call(provider, 'campaigns/fixture-campaign-a')).status, 200);
  assert.equal((await call(provider, 'campaigns/fixture-campaign-a')).status, 503);
  assert.equal((await call(provider, 'campaigns/fixture-campaign-a')).status, 503);
  assert.equal((await call(provider, 'campaigns/fixture-campaign-a')).status, 200);
});

test('bounded fixture delay holds a write before mutation and is consumed exactly once', async () => {
  let release!: () => void;
  const waits: number[] = [];
  const provider = new ZoomOutreachProvider('fixture-lg', { accountId: 'fixture-lg', lists: [], members: {}, campaigns: [], requestDelays: [{ path: '/v2/contact_center/outbound_campaign/contact_lists', method: 'POST', remaining: 1, milliseconds: 500 }] }, milliseconds => { waits.push(milliseconds); return new Promise(resolve => { release = resolve; }); });
  const pending = call(provider, 'contact_lists', 'POST', { name: 'Held fixture group' });
  assert.deepEqual(waits, [500]);
  assert.equal(provider.snapshot().lists.length, 0);
  assert.equal(provider.snapshot().requestDelays?.[0].remaining, 0);
  release();
  assert.equal((await pending).status, 201);
  const restored = new ZoomOutreachProvider('fixture-lg', provider.snapshot(), async () => { throw new Error('Consumed delay was replayed'); });
  assert.equal((await call(restored, 'contact_lists', 'POST', { name: 'Next fixture group' })).status, 201);
  assert.equal(restored.snapshot().lists.length, 2);
});

test('fixture delay offsets persist, unauthorized requests do not consume delays, and invalid scopes fail closed', async () => {
  const snapshot = { accountId: 'fixture-lg', lists: [], members: {}, campaigns: [], requestDelays: [{ path: '/v2/contact_center/outbound_campaign/contact_lists', method: 'GET', remaining: 1, milliseconds: 300, skip: 1 }] };
  const waits: number[] = [];
  const provider = new ZoomOutreachProvider('fixture-lg', snapshot, async milliseconds => { waits.push(milliseconds); });
  assert.equal((await provider.fetch(`${provider.apiBase}/contact_center/outbound_campaign/contact_lists`)).status, 401);
  assert.equal(provider.snapshot().requestDelays?.[0].skip, 1);
  assert.equal((await call(provider, 'contact_lists')).status, 200);
  assert.equal(waits.length, 0);
  const restored = new ZoomOutreachProvider('fixture-lg', provider.snapshot(), async milliseconds => { waits.push(milliseconds); });
  assert.equal((await call(restored, 'contact_lists')).status, 200);
  assert.deepEqual(waits, [300]);
  for (const invalid of [{ milliseconds: 15001 }, { remaining: 11 }, { method: 'CONNECT' }, { path: '/v2/users' }, { skip: -1 }]) {
    assert.throws(() => new ZoomOutreachProvider('fixture-lg', { ...snapshot, requestDelays: [{ ...snapshot.requestDelays[0], ...invalid }] }), /Invalid fixture/);
  }
  const failed = new ZoomOutreachProvider('fixture-lg', { ...snapshot, requestDelays: [], readFailures: [{ path: '/v2/contact_center/outbound_campaign/contact_lists', remaining: 1 }] });
  assert.equal((await call(failed, 'contact_lists')).status, 503);
  assert.equal((await call(failed, 'contact_lists')).status, 200);
});

test('candidate inventory failures and delays do not affect connection probes', async () => {
  const waits: number[] = [];
  const path = '/v2/contact_center/outbound_campaign/contact_lists';
  const provider = new ZoomOutreachProvider('fixture-lg', {
    accountId: 'fixture-lg', lists: [], members: {}, campaigns: [],
    requestDelays: [{ path, method: 'GET', remaining: 1, milliseconds: 300, pageSize: 100 }],
    readFailures: [{ path, remaining: 1, pageSize: 100 }],
  }, async milliseconds => { waits.push(milliseconds); });
  assert.equal((await call(provider, 'contact_lists?page_size=1')).status, 200);
  assert.deepEqual(waits, []);
  assert.equal(provider.snapshot().readFailures?.[0].remaining, 1);
  assert.equal((await call(provider, 'contact_lists?page_size=100')).status, 503);
  assert.deepEqual(waits, [300]);
  assert.equal((await call(provider, 'contact_lists?page_size=1')).status, 200);
  assert.equal((await call(provider, 'contact_lists?page_size=100')).status, 200);
  for (const pageSize of [0, 101, 1.5]) {
    assert.throws(() => new ZoomOutreachProvider('fixture-lg', { ...provider.snapshot(), readFailures: [{ path, remaining: 1, pageSize }] }), /Invalid fixture page size filter/);
    assert.throws(() => new ZoomOutreachProvider('fixture-lg', { ...provider.snapshot(), requestDelays: [{ path, method: 'GET', remaining: 1, milliseconds: 1, pageSize }] }), /Invalid fixture page size filter/);
  }
});
