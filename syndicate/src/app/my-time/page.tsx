import { requireRole } from '@/lib/authz';

// Phase 2 placeholder — real clock-in/out UI lands in Phase 4.
// Middleware already gates this path to admin|employee; requireRole here
// is belt-and-suspenders in case the middleware matcher changes later.
export default async function MyTimePlaceholderPage() {
  await requireRole('admin-or-employee');
  return (
    <div className="min-h-screen w-full font-mono" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-2">
          Employee
        </p>
        <h1 className="text-3xl font-black text-white mb-3">My Time</h1>
        <p className="text-sm text-neutral-400">
          Clock-in / clock-out UI ships in Phase 4 of this build.
        </p>
      </div>
    </div>
  );
}
