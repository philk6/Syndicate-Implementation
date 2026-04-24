'use client';

import { use } from 'react';
import { MyTeamPortal } from '@/components/MyTeamPortal';

// Admin view of a specific team. Reuses the student-facing portal via
// the teamId prop so the UI stays in exactly one place. resolveTeamContext
// on the API side authorizes the admin + flips isAdminImpersonating = true,
// which the portal surfaces as a banner.
export default function AdminTeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  return <MyTeamPortal teamId={teamId} />;
}
