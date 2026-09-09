export type ZoomOutreachSnapshot = {
  accountId: string;
  sequence?: number;
  lists: Record<string, unknown>[];
  members: Record<string, Record<string, unknown>[]>;
  campaigns: Record<string, unknown>[];
  campaignPageSize?: number;
  readFailures?: Array<{ path: string; remaining: number; skip?: number }>;
  requestDelays?: Array<{ path: string; method: string; remaining: number; milliseconds: number; skip?: number }>;
};

const fixturePath = /^\/v2\/contact_center\/outbound_campaign\/(?:campaigns(?:\/fixture-campaign-[a-z0-9-]+)?|contact_lists(?:\/fixture-list-\d+(?:\/contacts(?:\/fixture-contact-\d+)?)?)?)$/;

/** Stateful provider boundary for isolated API and browser tests; never falls back to network. */
export class ZoomOutreachProvider {
  readonly origin = "https://zoom-outreach.fixture.invalid";
  readonly apiBase = `${this.origin}/v2`;
  readonly tokenUrl = `${this.origin}/oauth/token`;
  readonly requests: Array<{ method: string; path: string }> = [];
  private sequence = 0;
  private lists = new Map<string, Record<string, unknown>>();
  private members = new Map<string, Map<string, Record<string, unknown>>>();
  private campaigns = new Map<string, Record<string, unknown>>();
  private campaignPageSize = 100;
  private readFailures: Array<{ path: string; remaining: number; skip?: number }> = [];
  private requestDelays: NonNullable<ZoomOutreachSnapshot["requestDelays"]> = [];

  constructor(readonly accountId: string, snapshot?: ZoomOutreachSnapshot, private readonly wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {
    if (!snapshot) return;
    if (snapshot.accountId !== accountId) throw new Error("Fixture account mismatch");
    const copy = structuredClone(snapshot);
    if (copy.campaignPageSize !== undefined) {
      if (!Number.isInteger(copy.campaignPageSize) || copy.campaignPageSize < 1 || copy.campaignPageSize > 100) throw new Error("Invalid fixture page size");
      this.campaignPageSize = copy.campaignPageSize;
    }
    for (const failure of copy.readFailures ?? []) {
      if (!fixturePath.test(failure.path) || !Number.isInteger(failure.remaining) || failure.remaining < 0 || failure.remaining > 100) throw new Error("Invalid fixture read failure");
      if (failure.skip !== undefined && (!Number.isInteger(failure.skip) || failure.skip < 0 || failure.skip > 100)) throw new Error("Invalid fixture failure offset");
      this.readFailures.push(failure);
    }
    for (const delay of copy.requestDelays ?? []) {
      if (!fixturePath.test(delay.path) || !["GET", "POST", "PATCH", "DELETE"].includes(delay.method) || !Number.isInteger(delay.remaining) || delay.remaining < 0 || delay.remaining > 10 || !Number.isInteger(delay.milliseconds) || delay.milliseconds < 1 || delay.milliseconds > 15000) throw new Error("Invalid fixture request delay");
      if (delay.skip !== undefined && (!Number.isInteger(delay.skip) || delay.skip < 0 || delay.skip > 100)) throw new Error("Invalid fixture delay offset");
      this.requestDelays.push(delay);
    }
    if (copy.sequence !== undefined) {
      if (!Number.isSafeInteger(copy.sequence) || copy.sequence < 0) throw new Error("Invalid fixture sequence");
      this.sequence = copy.sequence;
    }
    const id = (value: unknown) => {
      if (typeof value !== "string" || !value) throw new Error("Fixture ID missing");
      const number = /^fixture-(?:list|contact)-(\d+)$/.exec(value);
      if (number) this.sequence = Math.max(this.sequence, Number(number[1]));
      return value;
    };
    for (const row of copy.lists) {
      const listId = id(row.contact_list_id);
      if (this.lists.has(listId)) throw new Error("Duplicate fixture list");
      const members = new Map<string, Record<string, unknown>>();
      for (const member of copy.members[listId] ?? []) {
        const memberId = id(member.contact_id);
        if (members.has(memberId)) throw new Error("Duplicate fixture member");
        members.set(memberId, member);
      }
      this.lists.set(listId, { ...row, contacts_count: members.size }); this.members.set(listId, members);
    }
    for (const listId of Object.keys(copy.members)) if (!this.lists.has(listId)) throw new Error("Orphan fixture members");
    for (const row of copy.campaigns) {
      const campaignId = id(row.outbound_campaign_id);
      if (this.campaigns.has(campaignId)) throw new Error("Duplicate fixture campaign");
      this.campaigns.set(campaignId, row);
    }
  }

  snapshot(): ZoomOutreachSnapshot {
    return structuredClone({ accountId: this.accountId, sequence: this.sequence, lists: [...this.lists.values()], members: Object.fromEntries([...this.members].map(([id, rows]) => [id, [...rows.values()]])), campaigns: [...this.campaigns.values()], campaignPageSize: this.campaignPageSize, readFailures: this.readFailures, requestDelays: this.requestDelays });
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== this.origin) throw new Error("Fixture provider refuses an external origin");
    const method = request.method, path = url.pathname;
    this.requests.push({ method, path });
    if (path === "/oauth/token" && method === "POST") {
      if (url.searchParams.get("account_id") !== this.accountId) return Response.json({ code: 124 }, { status: 401 });
      return Response.json({ access_token: `fixture-${this.accountId}`, token_type: "bearer", expires_in: 3600 });
    }
    if (request.headers.get("authorization") !== `Bearer fixture-${this.accountId}`)
      return Response.json({ code: 124 }, { status: 401 });
    const delay = this.requestDelays.find(row => row.path === path && row.method === method && row.remaining > 0);
    if (delay && delay.skip) delay.skip--;
    else if (delay) { delay.remaining--; await this.wait(delay.milliseconds); }
    const failure = method === "GET" && this.readFailures.find(row => row.path === path && row.remaining > 0);
    if (failure && failure.skip) failure.skip--;
    else if (failure) { failure.remaining--; return Response.json({ code: "FIXTURE_READ_UNAVAILABLE" }, { status: 503 }); }
    if (path === "/v2/contact_center/outbound_campaign/campaigns" && method === "GET") {
      const token = url.searchParams.get("next_page_token"), match = token ? /^fixture-page-(\d+)$/.exec(token) : null;
      if (token && !match) return Response.json({ code: "INVALID_PAGE_TOKEN" }, { status: 400 });
      const offset = match ? Number(match[1]) : 0, rows = [...this.campaigns.values()], next = offset + this.campaignPageSize;
      return Response.json({ campaigns: rows.slice(offset, next), next_page_token: next < rows.length ? `fixture-page-${next}` : "" });
    }
    const campaignMatch = /^\/v2\/contact_center\/outbound_campaign\/campaigns\/([^/]+)$/.exec(path);
    if (campaignMatch && method === "GET") {
      const campaign = this.campaigns.get(campaignMatch[1]);
      return campaign ? Response.json(campaign) : Response.json({ code: 1001, message: "Not found" }, { status: 404 });
    }
    const match = /^\/v2\/contact_center\/outbound_campaign\/contact_lists(?:\/([^/]+))?(?:\/(contacts)(?:\/([^/]+))?)?$/.exec(path);
    if (!match) throw new Error(`Unsupported fixture endpoint: ${method} ${path}`);
    const [, listId, contacts, contactId] = match;
    const missing = () => Response.json({ code: 1001, message: "Not found" }, { status: 404 });
    if (!listId) {
      if (method === "GET") return Response.json({ contact_lists: [...this.lists.values()], next_page_token: "" });
      if (method === "POST") {
        const body = await request.json() as Record<string, unknown>, id = `fixture-list-${++this.sequence}`;
        const row = { ...body, contact_list_id: id, contacts_count: 0 };
        this.lists.set(id, row); this.members.set(id, new Map());
        return Response.json(row, { status: 201 });
      }
    } else {
      const list = this.lists.get(listId), members = this.members.get(listId);
      if (!list || !members) return missing();
      if (!contacts) {
        if (method === "GET") return Response.json(list);
        if (method === "PATCH") {
          Object.assign(list, await request.json());
          return new Response(null, { status: 204 });
        }
        if (method === "DELETE") {
          this.lists.delete(listId); this.members.delete(listId);
          return new Response(null, { status: 204 });
        }
      } else if (!contactId) {
        if (method === "GET") return Response.json({ contacts: [...members.values()], next_page_token: "" });
        if (method === "POST") {
          const body = await request.json() as Record<string, unknown>, id = `fixture-contact-${++this.sequence}`;
          members.set(id, { ...body, contact_id: id }); list.contacts_count = members.size;
          return Response.json({ contact_id: id }, { status: 201 });
        }
      } else {
        const contact = members.get(contactId);
        if (!contact) return missing();
        if (method === "PATCH") {
          Object.assign(contact, await request.json());
          return new Response(null, { status: 204 });
        }
        if (method === "DELETE") {
          members.delete(contactId); list.contacts_count = members.size;
          return new Response(null, { status: 204 });
        }
      }
    }
    throw new Error(`Unsupported fixture operation: ${method} ${path}`);
  };
}
