import { requireRole } from '@/lib/authz';

// Phase 2 placeholder — the 5-tab portal ships in Phase 3. Middleware
// already gates this to admin + one-on-one student; the server-component
// guard here is belt-and-suspenders.
export default async function MyTeamPlaceholder() {
  await requireRole('admin-or-student');
  return (
    <div className="min-h-screen w-full font-mono" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-2">One-on-One Student</p>
        <h1 className="text-3xl font-black text-white mb-3">My Team</h1>
        <p className="text-sm text-neutral-400">
          VAs, projects, hours, daily reports — all ship in Phase 3 of this build.
        </p>
      </div>
    </div>
  );
}
