import { requireRole } from '@/lib/authz';

// Phase 2 placeholder — admin teams overview ships in Phase 6.
export default async function AdminTeamsPlaceholder() {
  await requireRole('admin');
  return (
    <div className="min-h-screen w-full font-mono" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-2">Admin</p>
        <h1 className="text-3xl font-black text-white mb-3">Teams</h1>
        <p className="text-sm text-neutral-400">
          Cross-team aggregates + per-team detail views ship in Phase 6.
        </p>
      </div>
    </div>
  );
}
