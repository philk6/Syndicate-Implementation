'use client';

// Thin wrapper — all UI lives in MyTeamPortal so /admin/teams/[teamId]
// can reuse the exact same surface.
import { MyTeamPortal } from '@/components/MyTeamPortal';

export default function MyTeamPage() {
  return <MyTeamPortal />;
}
