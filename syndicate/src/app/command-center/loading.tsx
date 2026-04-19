export default function CommandCenterLoading() {
  return (
    <div className="min-h-screen w-full p-6" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-32 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
        <div className="h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
        <div className="h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
