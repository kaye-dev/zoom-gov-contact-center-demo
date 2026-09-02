import {
  getAdminResourceDefinition,
  isSupportedAdminAction,
} from "./catalog";
import {
  ADMIN_RESOURCE_KEYS,
  type AdminAccessAction,
  type AdminAccessActor,
  type AdminAccessDecision,
  type AdminAccessRoleSource,
  type AdminResourceKey,
} from "./types";

function roleReference(role: AdminAccessRoleSource) {
  return { id: role.id, name: role.name, systemKey: role.systemKey };
}

function evaluateRoleEffects(
  actor: AdminAccessActor,
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
) {
  const allowSources: ReturnType<typeof roleReference>[] = [];
  const denySources: ReturnType<typeof roleReference>[] = [];

  for (const role of actor.roles) {
    const explicit = role.permissions.find(
      (permission) =>
        permission.resourceKey === resourceKey && permission.action === action,
    );
    if (explicit?.effect === "DENY") denySources.push(roleReference(role));
    if (explicit?.effect === "ALLOW") allowSources.push(roleReference(role));
    if (role.systemKey === "FULL_ACCESS") allowSources.push(roleReference(role));
  }

  const unique = (sources: ReturnType<typeof roleReference>[]) =>
    [...new Map(sources.map((source) => [source.id, source])).values()].sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );

  return {
    allowSources: unique(allowSources),
    denySources: unique(denySources),
  };
}

function evaluateWithoutViewDependency(
  actor: AdminAccessActor,
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
): AdminAccessDecision {
  const supported = isSupportedAdminAction(resourceKey, action);
  if (!supported) {
    return {
      resourceKey,
      action,
      supported: false,
      allowed: false,
      reason: "UNSUPPORTED",
      allowSources: [],
      denySources: [],
    };
  }

  const { allowSources, denySources } = evaluateRoleEffects(
    actor,
    resourceKey,
    action,
  );
  if (denySources.length > 0) {
    return {
      resourceKey,
      action,
      supported: true,
      allowed: false,
      reason: "EXPLICIT_DENY",
      allowSources,
      denySources,
    };
  }
  if (allowSources.length === 0) {
    return {
      resourceKey,
      action,
      supported: true,
      allowed: false,
      reason: "IMPLICIT_DENY",
      allowSources,
      denySources,
    };
  }

  const resource = getAdminResourceDefinition(resourceKey)!;
  if (resource.requiresAdminUser && actor.adminAttribute !== "admin") {
    return {
      resourceKey,
      action,
      supported: true,
      allowed: false,
      reason: "ADMIN_USER_REQUIRED",
      allowSources,
      denySources,
    };
  }

  return {
    resourceKey,
    action,
    supported: true,
    allowed: true,
    reason: "EXPLICIT_ALLOW",
    allowSources,
    denySources,
  };
}

export function evaluateAdminAccess(
  actor: AdminAccessActor,
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
): AdminAccessDecision {
  const actionDecision = evaluateWithoutViewDependency(
    actor,
    resourceKey,
    action,
  );
  if (actionDecision.supported && actor.banned) {
    return {
      ...actionDecision,
      allowed: false,
      reason: "ACCOUNT_SUSPENDED",
      viewPrerequisite: undefined,
    };
  }
  if (actionDecision.supported && actor.mustChangePassword) {
    return {
      ...actionDecision,
      allowed: false,
      reason: "PASSWORD_CHANGE_REQUIRED",
      viewPrerequisite: undefined,
    };
  }
  if (!actionDecision.allowed || action === "VIEW") return actionDecision;

  const viewDecision = evaluateWithoutViewDependency(
    actor,
    resourceKey,
    "VIEW",
  );
  if (viewDecision.allowed) return actionDecision;

  return {
    ...actionDecision,
    allowed: false,
    reason: "VIEW_REQUIRED",
    viewPrerequisite: {
      allowed: viewDecision.allowed,
      reason: viewDecision.reason,
      allowSources: viewDecision.allowSources,
      denySources: viewDecision.denySources,
    },
  };
}

export function canAdminAccess(
  actor: AdminAccessActor,
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
) {
  if (actor.banned || actor.mustChangePassword) return false;
  return evaluateAdminAccess(actor, resourceKey, action).allowed;
}

export function getAllowedAdminPermissionSet(actor: AdminAccessActor) {
  const allowed = new Set<string>();
  for (const resourceKey of ADMIN_RESOURCE_KEYS) {
    for (const action of ["VIEW", "CREATE", "UPDATE", "DELETE"] as const) {
      if (canAdminAccess(actor, resourceKey, action)) {
        allowed.add(`${resourceKey}:${action}`);
      }
    }
  }
  return allowed;
}
