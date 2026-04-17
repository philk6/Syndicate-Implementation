export const StatusPill = ({ text, type }: { text: string; type: string }) => {
    const styles: Record<string, string> = {
        open: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        closed: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        late: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        progress: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        warehouse: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        amazon: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
        walmart: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
        active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        verified: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    };

    return (
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[type?.toLowerCase()] || styles.open} whitespace-nowrap`}>
            {text}
        </span>
    );
};
