// Pure ESM: the host publishes documentation in one tool invocation and
// acknowledges that exact publication in a later invocation. No disk receipt
// or caller-provided `ready` flag grants access to a Browser handle.
const sessions = new WeakMap();
const receipts = new WeakMap();
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export class BrowserBootstrapError extends Error {
  constructor(code, evidence = {}) {
    super(code === "BROWSER_DOCUMENTATION_REQUIRED"
      ? "Browser API documentation must be published completely and acknowledged in a later tool invocation"
      : "Browser operation requires explicit permission");
    this.name = "BrowserBootstrapError";
    this.code = code;
    this.evidence = evidence;
  }
}

function required(reason) {
  throw new BrowserBootstrapError("BROWSER_DOCUMENTATION_REQUIRED", { reason });
}

function identifier(value) {
  if (typeof value !== "string" || !idPattern.test(value)) required("invalid-runtime-identity");
  return value;
}

async function digest(text) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `sha256:${Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function beginBrowserBootstrap(runtime, { sessionId, generation, requiredDocumentIds }) {
  if (!runtime || typeof runtime !== "object") required("missing-runtime");
  if (typeof runtime.browserId === "string" && sessionId !== runtime.browserId) required("runtime-identity-mismatch");
  if (!Array.isArray(requiredDocumentIds) || !requiredDocumentIds.length ||
      new Set(requiredDocumentIds).size !== requiredDocumentIds.length) required("missing-document-inventory");
  const state = {
    sessionId: identifier(sessionId), generation: identifier(generation),
    requiredDocumentIds: requiredDocumentIds.map(identifier), publication: null, acknowledged: false,
  };
  sessions.set(runtime, state);
  return Object.freeze({ sessionId: state.sessionId, generation: state.generation });
}

export async function publishBrowserDocumentation(runtime, { invocationId, documents, publish }) {
  const state = sessions.get(runtime);
  if (!state) required("bootstrap-not-started");
  const invocation = identifier(invocationId);
  state.acknowledged = false;
  state.publication = null;
  if (typeof publish !== "function" || !Array.isArray(documents) || documents.length !== state.requiredDocumentIds.length) {
    required("incomplete-documentation");
  }
  const inventory = [];
  for (const id of state.requiredDocumentIds) {
    const matches = documents.filter((document) => document?.id === id);
    if (matches.length !== 1) required("incomplete-documentation");
    const document = matches[0];
    if (typeof document.text !== "string" || !document.text.trim() || document.complete !== true) {
      required("partial-documentation");
    }
    inventory.push({ id, text: document.text, sha256: await digest(document.text) });
  }
  // The provider/publisher is the public tool integration, not a document read
  // from an untrusted plan. A truncated tool output must not acknowledge this.
  await publish(inventory.map(({ id, text }) => ({ id, text })));
  if (sessions.get(runtime) !== state) required("runtime-changed-during-publication");
  const receipt = Object.freeze({
    sessionId: state.sessionId, generation: state.generation, invocationId: invocation,
    documents: Object.freeze(inventory.map(({ id, sha256 }) => Object.freeze({ id, sha256 }))),
  });
  state.publication = receipt;
  receipts.set(receipt, { runtime, state });
  return receipt;
}

export function acknowledgeBrowserDocumentation(runtime, { receipt, invocationId, displayedDocumentDigests }) {
  const state = sessions.get(runtime);
  const binding = receipts.get(receipt);
  if (!binding || binding.runtime !== runtime || binding.state !== state || state.publication !== receipt) {
    required("stale-or-foreign-publication");
  }
  if (identifier(invocationId) === receipt.invocationId) required("same-invocation");
  const expected = receipt.documents.map(({ id, sha256 }) => `${id}:${sha256}`).sort();
  if (!Array.isArray(displayedDocumentDigests) ||
      JSON.stringify(displayedDocumentDigests.map(({ id, sha256 }) => `${id}:${sha256}`).sort()) !== JSON.stringify(expected)) {
    required("unconfirmed-documentation");
  }
  state.acknowledged = true;
  return browserDocumentationStatus(runtime);
}

export function invalidateBrowserDocumentation(runtime) {
  sessions.delete(runtime);
}

export function browserDocumentationStatus(runtime) {
  const state = sessions.get(runtime);
  return state ? {
    sessionId: state.sessionId, generation: state.generation,
    status: state.acknowledged ? "ready" : "documentation-required",
    documents: state.publication?.documents ?? [],
  } : { status: "documentation-required" };
}

export function requireBrowserDocumentation(runtime) {
  if (sessions.get(runtime)?.acknowledged !== true) required("unread-or-reset-runtime");
  return browserDocumentationStatus(runtime);
}

// Never carry raw messages, query strings, or credentials into diagnostics.
export function classifyBrowserError(error, operation = "unknown") {
  const code = typeof error?.code === "string" ? error.code : undefined;
  const message = typeof error?.message === "string" ? error.message : "";
  const safeOperation = typeof operation === "string" && idPattern.test(operation) ? operation : "unknown";
  if (code === "BROWSER_DOCUMENTATION_REQUIRED" ||
      (!code && /^Required documentation has not been read:\s*"[A-Za-z0-9._/-]+"\s*$/u.test(message))) {
    return { code: "BROWSER_DOCUMENTATION_REQUIRED", category: "documentation", operation: safeOperation, recovery: "publish-and-acknowledge-in-same-task" };
  }
  if (["BROWSER_PERMISSION_DENIED", "PERMISSION_DENIED", "EACCES"].includes(code)) {
    return { code: "BROWSER_PERMISSION_DENIED", category: "permission", operation: safeOperation, recovery: "explicit-permission-required" };
  }
  const known = new Map([
    ["PARITY_CDP_CAPABILITY_UNAVAILABLE", "capability"],
    ["PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE", "capability"],
    ["PARITY_DPR_OVERRIDE_UNAVAILABLE", "dpr"],
    ["PARITY_DPR_MISMATCH", "dpr"],
    ["PARITY_VIEWPORT_MISMATCH", "viewport"],
    ["PARITY_NAVIGATION_TIMEOUT", "navigation"],
    ["PARITY_CLEANUP_FAILED", "cleanup"],
    ["PARITY_SELECTED_TAB_DRIFT", "ownership"],
    ["PARITY_REQUIRED_PROBE_UNAVAILABLE", "capability"],
    ["PARITY_ORIGIN_CONTEXT_INVALID", "origin"],
  ]);
  return { code: known.has(code) ? code : "PARITY_UNEXPECTED_ERROR", category: known.get(code) ?? "unknown", operation: safeOperation };
}

export function rethrowBrowserAccessError(error, operation) {
  const diagnosis = classifyBrowserError(error, operation);
  if (diagnosis.category === "documentation" || diagnosis.category === "permission") {
    throw new BrowserBootstrapError(diagnosis.code, diagnosis);
  }
}
