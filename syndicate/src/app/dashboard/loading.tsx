export default function DashboardLoading() {
  return (
    <div className="min-h-screen w-full p-6" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-24 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
      </div>
    </div>
  );
}
