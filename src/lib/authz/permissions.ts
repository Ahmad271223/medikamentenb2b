// Executable RBAC matrix — mirrors docs/architecture/G-permission-matrix.md.
// Every mutation is checked server-side against this module; frontend checks
// are cosmetic only.

export const ALL_PERMISSIONS = [
  'org:read', 'org:update', 'member:manage',
  'license:manage', 'license:verify',
  'warehouse:manage',
  'product:propose', 'product:verify',
  'batch:manage',
  'listing:create', 'listing:publish', 'listing:freeze',
  'demand:manage',
  'offer:submit', 'offer:accept',
  'transaction:read', 'transaction:compliance-approve',
  'document:upload', 'document:read', 'document:verify',
  'payment:read', 'shipment:read',
  'review:decide',
  'rule:draft', 'rule:verify-publish', 'country:trade-enable',
  'audit:read-org', 'audit:read-platform',
  'user:manage', 'config:manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
export type OrgRole = 'OWNER' | 'ADMIN' | 'COMMERCIAL' | 'INVENTORY' | 'COMPLIANCE' | 'FINANCE' | 'VIEWER';
export type PlatformRole = 'PLATFORM_ADMIN' | 'COMPLIANCE_OFFICER' | 'REGULATORY_ANALYST';

const ORG_ADMIN_SET: Permission[] = [
  'org:read', 'org:update', 'member:manage', 'license:manage', 'warehouse:manage',
  'product:propose', 'batch:manage', 'listing:create', 'listing:publish', 'demand:manage',
  'offer:submit', 'offer:accept', 'transaction:read', 'document:upload', 'document:read',
  'payment:read', 'shipment:read', 'audit:read-org',
];

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  OWNER: ORG_ADMIN_SET,
  ADMIN: ORG_ADMIN_SET,
  COMMERCIAL: [
    'org:read', 'product:propose', 'listing:create', 'listing:publish', 'demand:manage',
    'offer:submit', 'offer:accept', 'transaction:read', 'document:upload', 'document:read', 'shipment:read',
  ],
  INVENTORY: [
    'org:read', 'warehouse:manage', 'product:propose', 'batch:manage',
    'document:upload', 'document:read', 'shipment:read',
  ],
  COMPLIANCE: [
    'org:read', 'license:manage', 'transaction:read', 'document:upload', 'document:read', 'audit:read-org',
  ],
  FINANCE: ['org:read', 'transaction:read', 'payment:read', 'document:read'],
  VIEWER: ['org:read', 'transaction:read', 'document:read', 'shipment:read'],
};

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  // Deliberate separation of duties: the platform admin does NOT hold
  // 'transaction:compliance-approve' — releasing transactions is exclusively
  // the Compliance Officer's authority.
  PLATFORM_ADMIN: [
    'org:read', 'org:update', 'member:manage', 'license:manage', 'license:verify',
    'warehouse:manage', 'product:propose', 'product:verify', 'batch:manage',
    'listing:create', 'listing:publish', 'listing:freeze', 'demand:manage',
    'transaction:read', 'document:upload', 'document:read', 'document:verify',
    'payment:read', 'shipment:read', 'review:decide', 'rule:draft', 'rule:verify-publish',
    'country:trade-enable', 'audit:read-org', 'audit:read-platform', 'user:manage', 'config:manage',
  ],
  COMPLIANCE_OFFICER: [
    'org:read', 'license:verify', 'product:verify', 'listing:freeze',
    'transaction:read', 'transaction:compliance-approve',
    'document:read', 'document:verify', 'review:decide',
    'rule:draft', 'rule:verify-publish', 'shipment:read',
    'audit:read-org', 'audit:read-platform',
  ],
  REGULATORY_ANALYST: ['rule:draft'],
};

export interface Actor {
  userId: string;
  platformRole?: PlatformRole | null;
  /** Active organization context, when acting within an organization. */
  orgId?: string | null;
  orgRole?: OrgRole | null;
}

export interface PermissionScope {
  /** Organization the target resource belongs to. */
  orgId?: string;
}

/**
 * Central permission check. Org-scoped permissions require the actor to act
 * within the same organization; platform roles carry their permissions across
 * organizations.
 */
export function hasPermission(actor: Actor, permission: Permission, scope: PermissionScope = {}): boolean {
  if (actor.platformRole && PLATFORM_ROLE_PERMISSIONS[actor.platformRole].includes(permission)) {
    return true;
  }
  if (!actor.orgRole || !actor.orgId) return false;
  if (!ORG_ROLE_PERMISSIONS[actor.orgRole].includes(permission)) return false;
  if (scope.orgId !== undefined && scope.orgId !== actor.orgId) return false;
  return true;
}
