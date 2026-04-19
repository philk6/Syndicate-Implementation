export default function RootLoading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-[#FF6B35] rounded-full animate-spin" />
        <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest">Loading...</span>
      </div>
    </div>
  );
}
