/**
 * Permission profiles for VAs.
 *
 * Each profile maps to a set of sidebar items the VA is allowed to see.
 * Items not in the allow-list are hidden, and the middleware / page-level
 * guards additionally hard-block admin-only routes regardless of profile
 * (Manage Orders, Manage Users, Credit Dashboard, Credit Overview, Open
 * Orders, /admin/employees, /admin/teams).
 *
 * Profiles are platform constants for now; per-student custom profiles are a
 * future feature. Add a new profile by:
 *   1) extending the `va_profile` enum in a migration,
 *   2) adding it to the type + VA_PROFILE_VISIBILITY map below,
 *   3) updating the sidebar to honor it (already driven from this map).
 */

export type VaProfile = 'research' | 'operations' | 'customer_service' | 'full_access';

/** Canonical list of every sidebar item the VA sidebar knows how to render. */
export type SidebarItemKey =
  | 'dashboard'
  | 'supplier-intel'
  | 'history'
  | 'chat'
  | 'command-center'
  | 'prep-portal'
  | 'prep-ops'
  | 'my-team-summary' // read-only team summary, reserved for CS VA
  | 'my-time';

export const VA_PROFILE_LABELS: Record<VaProfile, string> = {
  research: 'Research VA',
  operations: 'Operations VA',
  customer_service: 'Customer Service VA',
  full_access: 'Full Access VA',
};

export const VA_PROFILE_DESCRIPTIONS: Record<VaProfile, string> = {
  research: 'Dashboard, Supplier Intel, My Time.',
  operations: 'Dashboard, Prep Portal, Prep Ops, Chat, Command Center, My Time.',
  customer_service: 'Dashboard, History, Chat, My Team summary, My Time.',
  full_access: 'Everything the student sees — except Open Orders, Manage Orders, Manage Users, Credit Dashboard, Credit Overview.',
};

/** The allow-list of sidebar items per VA profile. */
export const VA_PROFILE_VISIBILITY: Record<VaProfile, ReadonlyArray<SidebarItemKey>> = {
  research: ['dashboard', 'supplier-intel', 'my-time'],
  operations: ['dashboard', 'prep-portal', 'prep-ops', 'chat', 'command-center', 'my-time'],
  customer_service: ['dashboard', 'history', 'chat', 'my-team-summary', 'my-time'],
  // Full access == union of all VA-visible items. Explicitly listed rather
  // than "everything" so adding a new admin-only item can't accidentally
  // leak to Full Access VAs without a review.
  full_access: [
    'dashboard', 'supplier-intel', 'history', 'chat', 'command-center',
    'prep-portal', 'prep-ops', 'my-team-summary', 'my-time',
  ],
};

export function vaCanSee(profile: VaProfile | null | undefined, item: SidebarItemKey): boolean {
  if (!profile) return false;
  return VA_PROFILE_VISIBILITY[profile].includes(item);
}

/** Paths that are always blocked for VAs regardless of profile. */
export const VA_HARD_BLOCKED_PATHS = [
  '/orders',           // Open Orders (buyer's group only)
  '/admin/orders',
  '/admin/manage-users',
  '/admin/credit-dashboard',
  '/admin/employees',
  '/admin/teams',
  '/credit-overview',
] as const;
