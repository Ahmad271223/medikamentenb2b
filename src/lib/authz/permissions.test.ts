import { describe, expect, it } from 'vitest';
import { hasPermission, type Actor } from './permissions';

const orgActor = (role: NonNullable<Actor['orgRole']>, orgId = 'org-1'): Actor => ({
  userId: 'u1',
  orgId,
  orgRole: role,
});
const platformActor = (role: NonNullable<Actor['platformRole']>): Actor => ({
  userId: 'u2',
  platformRole: role,
});

describe('organization roles', () => {
  it('VIEWER is strictly read-only', () => {
    const viewer = orgActor('VIEWER');
    expect(hasPermission(viewer, 'org:read', { orgId: 'org-1' })).toBe(true);
    expect(hasPermission(viewer, 'batch:manage', { orgId: 'org-1' })).toBe(false);
    expect(hasPermission(viewer, 'listing:create', { orgId: 'org-1' })).toBe(false);
    expect(hasPermission(viewer, 'document:upload', { orgId: 'org-1' })).toBe(false);
  });

  it('INVENTORY manages batches only within its own organization', () => {
    const inv = orgActor('INVENTORY');
    expect(hasPermission(inv, 'batch:manage', { orgId: 'org-1' })).toBe(true);
    expect(hasPermission(inv, 'batch:manage', { orgId: 'org-OTHER' })).toBe(false);
    expect(hasPermission(inv, 'listing:publish', { orgId: 'org-1' })).toBe(false);
  });

  it('FINANCE sees payments but cannot upload documents', () => {
    const fin = orgActor('FINANCE');
    expect(hasPermission(fin, 'payment:read', { orgId: 'org-1' })).toBe(true);
    expect(hasPermission(fin, 'document:upload', { orgId: 'org-1' })).toBe(false);
  });

  it('no org role can decide compliance reviews or verify licenses', () => {
    for (const role of ['OWNER', 'ADMIN', 'COMMERCIAL', 'INVENTORY', 'COMPLIANCE', 'FINANCE', 'VIEWER'] as const) {
      expect(hasPermission(orgActor(role), 'review:decide', { orgId: 'org-1' })).toBe(false);
      expect(hasPermission(orgActor(role), 'license:verify', { orgId: 'org-1' })).toBe(false);
      expect(hasPermission(orgActor(role), 'transaction:compliance-approve', { orgId: 'org-1' })).toBe(false);
    }
  });
});

describe('platform roles', () => {
  it('REGULATORY_ANALYST drafts rules but can neither publish nor release transactions', () => {
    const analyst = platformActor('REGULATORY_ANALYST');
    expect(hasPermission(analyst, 'rule:draft')).toBe(true);
    expect(hasPermission(analyst, 'rule:verify-publish')).toBe(false);
    expect(hasPermission(analyst, 'transaction:compliance-approve')).toBe(false);
    expect(hasPermission(analyst, 'review:decide')).toBe(false);
  });

  it('COMPLIANCE_OFFICER releases transactions but does not manage platform config', () => {
    const officer = platformActor('COMPLIANCE_OFFICER');
    expect(hasPermission(officer, 'transaction:compliance-approve')).toBe(true);
    expect(hasPermission(officer, 'review:decide')).toBe(true);
    expect(hasPermission(officer, 'license:verify')).toBe(true);
    expect(hasPermission(officer, 'config:manage')).toBe(false);
    expect(hasPermission(officer, 'user:manage')).toBe(false);
  });

  it('separation of duties: PLATFORM_ADMIN cannot release transactions', () => {
    const admin = platformActor('PLATFORM_ADMIN');
    expect(hasPermission(admin, 'user:manage')).toBe(true);
    expect(hasPermission(admin, 'config:manage')).toBe(true);
    expect(hasPermission(admin, 'country:trade-enable')).toBe(true);
    expect(hasPermission(admin, 'transaction:compliance-approve')).toBe(false);
  });

  it('platform permissions apply across organizations', () => {
    const officer = platformActor('COMPLIANCE_OFFICER');
    expect(hasPermission(officer, 'org:read', { orgId: 'any-org' })).toBe(true);
  });

  it('platform staff without org membership hold no commercial powers', () => {
    const officer = platformActor('COMPLIANCE_OFFICER');
    expect(hasPermission(officer, 'offer:submit', { orgId: 'org-1' })).toBe(false);
    expect(hasPermission(officer, 'offer:accept', { orgId: 'org-1' })).toBe(false);
  });
});

describe('actors without context', () => {
  it('no roles → no permissions', () => {
    expect(hasPermission({ userId: 'u3' }, 'org:read', { orgId: 'org-1' })).toBe(false);
  });
});
