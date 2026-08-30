import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  NeonDeploymentConfig,
  NeonRequest,
} from "../lib/neon-api";
import {
  createNeonRehearsal,
  deleteNeonRehearsal,
  NeonMutationAmbiguousError,
  type NeonRehearsal,
} from "../lib/neon-rehearsal";

const config: NeonDeploymentConfig = {
  projectId: "green-star-22081727",
  projectName: "zoom-gov-contact-center-demo",
  branchId: "br-production",
  databaseName: "app",
  roleName: "app_owner",
  regionId: "aws-ap-southeast-1",
  expectedPlan: "free",
};

const apiKey = "neon-api-key-never-expose";
const secretErrorBody =
  "postgresql://app_owner:body-secret@ep-production.ap-southeast-1.aws.neon.tech/app";
const childBranchId = "br-rehearsal";
const endpointId = "ep-rehearsal";
const endpointHost = `${endpointId}.ap-southeast-1.aws.neon.tech`;
const parentLsn = "0/1DE2850";
const fixedNow = Date.UTC(2026, 7, 30, 1, 2, 3);
const expectedBranchName =
  "rehearsal/deploy-20260830T010203Z-abcdefgh1234";
const createBranchOperationId = "11111111-1111-4111-8111-111111111111";
const startComputeOperationId = "22222222-2222-4222-8222-222222222222";
const deleteBranchOperationId = "33333333-3333-4333-8333-333333333333";
const projectSyncOperationId = "44444444-4444-4444-8444-444444444444";

type RecordedRequest = {
  url: URL;
  method: string;
  authorization: string | null;
  body: unknown;
};

type HarnessOptions = {
  mutateCreatedBranch?: (branch: Record<string, unknown>) => void;
  mutateCreatedEndpoint?: (endpoint: Record<string, unknown>) => void;
  createOperationStatuses?: Partial<Record<string, string[]>>;
  createPostFailure?: "throw" | "http";
  connectionFailure?: boolean;
  deleteFailure?: "throw-present" | "throw-absent";
  includeChildBranch?: boolean;
  initiallyDeleted?: boolean;
  paginateBranches?: boolean;
  readbackPendingState?: unknown;
  projectSyncBranchId?: string;
};

function branch(
  state: "init" | "ready" = "ready",
): Record<string, unknown> {
  return {
    id: childBranchId,
    project_id: config.projectId,
    parent_id: config.branchId,
    parent_lsn: parentLsn,
    name: expectedBranchName,
    current_state: state,
    ...(state === "init" ? { pending_state: "ready" } : {}),
    default: false,
    protected: false,
    init_source: "parent-data",
  };
}

function endpoint(
  state: "init" | "active" = "active",
): Record<string, unknown> {
  return {
    id: endpointId,
    host: endpointHost,
    project_id: config.projectId,
    branch_id: childBranchId,
    region_id: config.regionId,
    type: "read_write",
    current_state: state,
    ...(state === "init" ? { pending_state: "active" } : {}),
    disabled: false,
  };
}

function operation(
  id: string,
  status: string,
  endpointOperation: boolean,
): Record<string, unknown> {
  return {
    id,
    project_id: config.projectId,
    branch_id: childBranchId,
    ...(endpointOperation ? { endpoint_id: endpointId } : {}),
    action: endpointOperation ? "start_compute" : "create_branch",
    status,
  };
}

function projectSyncOperation(
  status: string,
  branchId?: string,
): Record<string, unknown> {
  return {
    id: projectSyncOperationId,
    project_id: config.projectId,
    ...(branchId === undefined ? {} : { branch_id: branchId }),
    action: "epc_sync",
    status,
  };
}

function rehearsal(): NeonRehearsal {
  return {
    branchId: childBranchId,
    branchName: expectedBranchName,
    parentBranchId: config.branchId,
    parentLsn,
    endpointId,
    directUrl: `postgresql://${config.roleName}:p%40ss@${endpointHost}/${config.databaseName}?sslmode=require`,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const requests: RecordedRequest[] = [];
  const waits: number[] = [];
  const operationCalls = new Map<string, number>();
  let clock = fixedNow;
  let deleted = options.initiallyDeleted ?? false;

  const request: NeonRequest = async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const bodyValue =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    requests.push({
      url,
      method,
      authorization: headers.get("authorization"),
      body: bodyValue,
    });

    const projectPath = `/api/v2/projects/${config.projectId}`;
    if (method === "GET" && url.pathname === projectPath) {
      return Response.json({
        project: {
          id: config.projectId,
          name: config.projectName,
          region_id: config.regionId,
        },
      });
    }
    if (
      method === "GET" &&
      url.pathname === `${projectPath}/branches/${config.branchId}`
    ) {
      return Response.json({
        branch: {
          id: config.branchId,
          project_id: config.projectId,
          current_state: "ready",
        },
      });
    }
    if (method === "POST" && url.pathname === `${projectPath}/branches`) {
      if (options.createPostFailure === "throw") {
        throw new Error(`${apiKey} ${secretErrorBody}`);
      }
      if (options.createPostFailure === "http") {
        return new Response(JSON.stringify({ detail: `${apiKey} ${secretErrorBody}` }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      const createdBranch = branch("init");
      const createdEndpoint = endpoint("init");
      options.mutateCreatedBranch?.(createdBranch);
      options.mutateCreatedEndpoint?.(createdEndpoint);
      return Response.json(
        {
          branch: createdBranch,
          endpoints: [createdEndpoint],
          operations: [
            projectSyncOperation("running", options.projectSyncBranchId),
            operation(createBranchOperationId, "running", false),
            operation(startComputeOperationId, "scheduling", true),
          ],
        },
        { status: 201 },
      );
    }
    if (
      method === "GET" &&
      url.pathname.startsWith(`${projectPath}/operations/`)
    ) {
      const operationId = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
      const defaults =
        operationId === projectSyncOperationId
          ? ["finished"]
          : operationId === createBranchOperationId
          ? ["finished"]
          : operationId === startComputeOperationId
            ? ["finished"]
            : operationId === deleteBranchOperationId
              ? ["finished"]
              : undefined;
      assert.ok(defaults, `Unexpected operation ID '${operationId}'.`);
      const statuses =
        options.createOperationStatuses?.[operationId] ?? defaults;
      const count = operationCalls.get(operationId) ?? 0;
      operationCalls.set(operationId, count + 1);
      const status = statuses[Math.min(count, statuses.length - 1)];
      assert.ok(status);
      return Response.json({
        operation:
          operationId === projectSyncOperationId
            ? projectSyncOperation(status, options.projectSyncBranchId)
            : operation(
                operationId,
                status,
                operationId === startComputeOperationId,
              ),
      });
    }
    if (
      method === "GET" &&
      url.pathname === `${projectPath}/branches/${childBranchId}`
    ) {
      const readbackBranch = branch();
      if ("readbackPendingState" in options) {
        readbackBranch.pending_state = options.readbackPendingState;
      }
      return Response.json({ branch: readbackBranch });
    }
    if (
      method === "GET" &&
      url.pathname === `${projectPath}/branches/${childBranchId}/endpoints`
    ) {
      return Response.json({
        endpoints: deleted ? [] : [endpoint()],
      });
    }
    if (
      method === "GET" &&
      url.pathname === `${projectPath}/endpoints/${endpointId}`
    ) {
      return Response.json({ endpoint: endpoint() });
    }
    if (method === "GET" && url.pathname === `${projectPath}/connection_uri`) {
      if (options.connectionFailure) {
        return new Response(
          JSON.stringify({ detail: `${apiKey} ${secretErrorBody}` }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }
      const pooled = url.searchParams.get("pooled") === "true";
      assert.equal(url.searchParams.get("branch_id"), childBranchId);
      assert.equal(url.searchParams.get("endpoint_id"), endpointId);
      assert.equal(url.searchParams.get("database_name"), config.databaseName);
      assert.equal(url.searchParams.get("role_name"), config.roleName);
      return Response.json({
        uri: `postgresql://${config.roleName}:p%40ss@${endpointId}${pooled ? "-pooler" : ""}.ap-southeast-1.aws.neon.tech/${config.databaseName}?sslmode=require`,
      });
    }
    if (method === "GET" && url.pathname === `${projectPath}/branches`) {
      const parentBranch = {
        id: config.branchId,
        project_id: config.projectId,
        name: "production",
        default: true,
        protected: true,
      };
      const branches: Record<string, unknown>[] = [];
      const cursor = url.searchParams.get("cursor");
      if (!options.paginateBranches || cursor === null) {
        branches.push(parentBranch);
      }
      if (options.paginateBranches && cursor === null) {
        return Response.json({
          branches,
          pagination: { next: "second-page" },
        });
      }
      if (options.paginateBranches) {
        assert.equal(cursor, "second-page");
      }
      if (!deleted) {
        branches.push(branch());
      }
      if (options.includeChildBranch) {
        branches.push({
          id: "br-rehearsal-child",
          project_id: config.projectId,
          parent_id: childBranchId,
          name: "rehearsal/child",
          default: false,
          protected: false,
        });
      }
      return Response.json({ branches, pagination: {} });
    }
    if (
      method === "DELETE" &&
      url.pathname === `${projectPath}/branches/${childBranchId}`
    ) {
      if (options.deleteFailure === "throw-present") {
        throw new Error(`${apiKey} ${secretErrorBody}`);
      }
      if (options.deleteFailure === "throw-absent") {
        deleted = true;
        throw new Error(`${apiKey} ${secretErrorBody}`);
      }
      deleted = true;
      return Response.json({
        branch: branch(),
        operations: [
          {
            ...operation(deleteBranchOperationId, "running", false),
            action: "delete_timeline",
            endpoint_id: endpointId,
          },
        ],
      });
    }
    throw new Error(`Unexpected Neon API request: ${method} ${url.pathname}`);
  };

  return {
    dependencies: {
      request,
      wait: async (delayMs: number) => {
        waits.push(delayMs);
        clock += delayMs;
      },
      now: () => clock,
      randomId: () => "abcdefgh-1234-5678",
      operationPollIntervalMs: 100,
      operationTimeoutMs: 250,
    },
    requests,
    waits,
  };
}

test("one POST creates an exact Production child and returns only the validated direct URI", async () => {
  const harness = createHarness({
    createOperationStatuses: {
      [createBranchOperationId]: ["failed", "finished"],
    },
  });
  const result = await createNeonRehearsal(
    config,
    apiKey,
    harness.dependencies,
  );

  assert.deepEqual(result, rehearsal());
  assert.deepEqual(harness.waits, [100]);
  const createRequests = harness.requests.filter(
    ({ method, url }) => method === "POST" && url.pathname.endsWith("/branches"),
  );
  assert.equal(createRequests.length, 1);
  assert.deepEqual(createRequests[0]?.body, {
    branch: {
      name: expectedBranchName,
      parent_id: config.branchId,
      protected: false,
      init_source: "parent-data",
    },
    endpoints: [{ type: "read_write" }],
  });
  for (const recorded of harness.requests) {
    assert.equal(recorded.authorization, `Bearer ${apiKey}`);
    assert.equal(recorded.url.href.includes(apiKey), false);
    assert.equal((JSON.stringify(recorded.body) ?? "").includes(apiKey), false);
  }
  const uriRequests = harness.requests.filter(({ url }) =>
    url.pathname.endsWith("/connection_uri"),
  );
  assert.equal(uriRequests.length, 2);
  assert.deepEqual(
    uriRequests.map(({ url }) => url.searchParams.get("pooled")).sort(),
    ["false", "true"],
  );
});

for (const [description, options] of [
  [
    "parent_id mismatch",
    {
      mutateCreatedBranch: (value: Record<string, unknown>) => {
        value.parent_id = "br-wrong-parent";
      },
    },
  ],
  [
    "default child",
    {
      mutateCreatedBranch: (value: Record<string, unknown>) => {
        value.default = true;
      },
    },
  ],
  [
    "protected child",
    {
      mutateCreatedBranch: (value: Record<string, unknown>) => {
        value.protected = true;
      },
    },
  ],
  [
    "wrong child project",
    {
      mutateCreatedBranch: (value: Record<string, unknown>) => {
        value.project_id = "wrong-project";
      },
    },
  ],
  [
    "wrong endpoint branch",
    {
      mutateCreatedEndpoint: (value: Record<string, unknown>) => {
        value.branch_id = "br-wrong-parent";
      },
    },
  ],
  [
    "wrong endpoint project",
    {
      mutateCreatedEndpoint: (value: Record<string, unknown>) => {
        value.project_id = "wrong-project";
      },
    },
  ],
  [
    "wrong endpoint region",
    {
      mutateCreatedEndpoint: (value: Record<string, unknown>) => {
        value.region_id = "aws-us-east-1";
      },
    },
  ],
  [
    "read-only endpoint",
    {
      mutateCreatedEndpoint: (value: Record<string, unknown>) => {
        value.type = "read_only";
      },
    },
  ],
] satisfies Array<[string, HarnessOptions]>) {
  test(`create fails closed on ${description}`, async () => {
    const harness = createHarness(options);
    await assert.rejects(
      createNeonRehearsal(config, apiKey, harness.dependencies),
    );
    assert.equal(
      harness.requests.some(({ url }) => url.pathname.endsWith("/connection_uri")),
      false,
    );
  });
}

test("terminal operation failure stops before connection URI retrieval", async () => {
  const harness = createHarness({
    createOperationStatuses: {
      [createBranchOperationId]: ["skipped"],
    },
  });
  await assert.rejects(
    createNeonRehearsal(config, apiKey, harness.dependencies),
    /status 'skipped'/u,
  );
  assert.equal(
    harness.requests.some(({ url }) => url.pathname.endsWith("/connection_uri")),
    false,
  );
});

test("create response may omit parent_lsn and ready readback may use pending_state null", async () => {
  const harness = createHarness({
    mutateCreatedBranch: (value) => {
      delete value.parent_lsn;
    },
    readbackPendingState: null,
  });
  const result = await createNeonRehearsal(
    config,
    apiKey,
    harness.dependencies,
  );
  assert.equal(result.parentLsn, parentLsn);
});

test("project-scoped epc_sync may omit resource IDs but cannot claim another branch", async () => {
  const accepted = createHarness();
  await createNeonRehearsal(config, apiKey, accepted.dependencies);

  const rejected = createHarness({ projectSyncBranchId: "br-wrong-parent" });
  await assert.rejects(
    createNeonRehearsal(config, apiKey, rejected.dependencies),
    /operation identity is invalid/u,
  );
  assert.equal(
    rejected.requests.some(({ url }) => url.pathname.endsWith("/connection_uri")),
    false,
  );
});

test("injected clock and wait bound non-terminal failed operation polling", async () => {
  const harness = createHarness({
    createOperationStatuses: {
      [createBranchOperationId]: ["failed"],
    },
  });
  await assert.rejects(
    createNeonRehearsal(config, apiKey, harness.dependencies),
    /Timed out waiting/u,
  );
  assert.deepEqual(harness.waits, [100, 100, 100]);
});

test("ambiguous POST is never retried when exact-name reconciliation finds nothing", async () => {
  const harness = createHarness({
    createPostFailure: "throw",
    initiallyDeleted: true,
  });
  await assert.rejects(
    createNeonRehearsal(config, apiKey, harness.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof NeonMutationAmbiguousError);
      assert.equal(error.message.includes(apiKey), false);
      assert.equal(error.message.includes(secretErrorBody), false);
      return true;
    },
  );
  assert.equal(
    harness.requests.filter(({ method }) => method === "POST").length,
    1,
  );
});

test("ambiguous POST adopts one exact parent/name child through safe GET reconciliation", async () => {
  const harness = createHarness({ createPostFailure: "throw" });
  const result = await createNeonRehearsal(
    config,
    apiKey,
    harness.dependencies,
  );
  assert.deepEqual(result, rehearsal());
  assert.equal(
    harness.requests.filter(({ method }) => method === "POST").length,
    1,
  );
  assert.ok(
    harness.requests.some(({ url }) =>
      url.pathname.endsWith(`/branches/${childBranchId}/endpoints`),
    ),
  );
});

test("HTTP and URI error bodies are discarded without exposing secrets", async () => {
  for (const options of [
    { createPostFailure: "http" as const },
    { connectionFailure: true },
  ]) {
    const harness = createHarness(options);
    await assert.rejects(
      createNeonRehearsal(config, apiKey, harness.dependencies),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /HTTP 403/u);
        assert.equal(error.message.includes(apiKey), false);
        assert.equal(error.message.includes(secretErrorBody), false);
        return true;
      },
    );
  }
});

test("soft delete validates the exact child, polls operations, and proves active-list absence", async () => {
  const harness = createHarness();
  await deleteNeonRehearsal(
    config,
    apiKey,
    rehearsal(),
    harness.dependencies,
  );

  const deleteRequests = harness.requests.filter(
    ({ method }) => method === "DELETE",
  );
  assert.equal(deleteRequests.length, 1);
  assert.equal(deleteRequests[0]?.url.searchParams.get("hard_delete"), "false");
  assert.equal(deleteRequests[0]?.body, undefined);
  assert.ok(
    harness.requests.filter(
      ({ method, url }) =>
        method === "GET" && url.pathname.endsWith("/branches"),
    ).length >= 2,
  );
});

test("soft delete follows pagination.next as the next cursor on every active-list readback", async () => {
  const harness = createHarness({ paginateBranches: true });
  await deleteNeonRehearsal(
    config,
    apiKey,
    rehearsal(),
    harness.dependencies,
  );
  const branchLists = harness.requests.filter(
    ({ method, url }) =>
      method === "GET" && url.pathname.endsWith("/branches"),
  );
  assert.deepEqual(
    branchLists.map(({ url }) => url.searchParams.get("cursor")),
    [null, "second-page", null, "second-page"],
  );
});

test("already absent rehearsal is a successful readback and does not issue DELETE", async () => {
  const harness = createHarness({ initiallyDeleted: true });
  await deleteNeonRehearsal(
    config,
    apiKey,
    rehearsal(),
    harness.dependencies,
  );
  assert.equal(
    harness.requests.some(({ method }) => method === "DELETE"),
    false,
  );
});

test("child branches block cleanup before the DELETE mutation", async () => {
  const harness = createHarness({ includeChildBranch: true });
  await assert.rejects(
    deleteNeonRehearsal(
      config,
      apiKey,
      rehearsal(),
      harness.dependencies,
    ),
    /has a child branch/u,
  );
  assert.equal(
    harness.requests.some(({ method }) => method === "DELETE"),
    false,
  );
});

test("ambiguous DELETE performs only safe readback and never retries the mutation", async () => {
  const harness = createHarness({ deleteFailure: "throw-present" });
  await assert.rejects(
    deleteNeonRehearsal(
      config,
      apiKey,
      rehearsal(),
      harness.dependencies,
    ),
    (error: unknown) => {
      assert.ok(error instanceof NeonMutationAmbiguousError);
      assert.equal(error.message.includes(apiKey), false);
      assert.equal(error.message.includes(secretErrorBody), false);
      return true;
    },
  );
  assert.equal(
    harness.requests.filter(({ method }) => method === "DELETE").length,
    1,
  );
});

test("ambiguous DELETE is accepted only when safe readback proves absence", async () => {
  const harness = createHarness({ deleteFailure: "throw-absent" });
  await deleteNeonRehearsal(
    config,
    apiKey,
    rehearsal(),
    harness.dependencies,
  );
  assert.equal(
    harness.requests.filter(({ method }) => method === "DELETE").length,
    1,
  );
});
