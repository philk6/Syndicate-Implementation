'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { Package, DollarSign, AlertCircle, Truck, Search, Radio } from 'lucide-react';
import { MissionControlBackground } from '@/components/command-center/MissionControlBackground';
import { StatusBadge } from '@/components/prep/StatusBadge';
import { AdminShipmentManagementDrawer } from '@/components/prep/AdminShipmentManagementDrawer';
import { PREP_GOLD, STATUS_LABEL, type PrepStatus } from '@/components/prep/prepTheme';
import { getAllShipments, getAdminPrepDashboard } from '@/lib/actions/prep';

interface AdminShipment {
  id: number;
  supplier_name: string;
  po_number: string | null;
  status: PrepStatus;
  estimated_arrival: string | null;
  unit_count_expected: number | null;
  unit_count_received: number | null;
  updated_at: string;
  owner: { firstname: string | null; lastname: string | null; email: string } | null;
  company: { name: string } | null;
}

interface Stats {
  activeShipments: number;
  pendingInvoiceTotal: number;
  unitsReceivedToday: number;
  unitsReceivedThisWeek: number;
  shipmentsNeedingAttention: number;
}

export default function AdminPrepPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<AdminShipment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | PrepStatus>('all');
  const [search, setSearch] = useState('');
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const [s, st] = await Promise.all([
        getAllShipments(user.user_id),
        getAdminPrepDashboard(user.user_id),
      ]);
      setShipments(s as AdminShipment[]);
      setStats(st);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || (user?.role !== 'admin' && user?.role !== 'employee')) { router.push('/login'); return; }
    reload();
  }, [authLoading, isAuthenticated, user, router, reload]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shipments.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!term) return true;
      const name = `${s.owner?.firstname ?? ''} ${s.owner?.lastname ?? ''}`.toLowerCase();
      return (
        s.supplier_name.toLowerCase().includes(term) ||
        (s.po_number ?? '').toLowerCase().includes(term) ||
        name.includes(term) ||
        (s.company?.name ?? '').toLowerCase().includes(term)
      );
    });
  }, [shipments, statusFilter, search]);

  if (authLoading || loading) return <><MissionControlBackground /><PageLoadingSpinner /></>;
  if (!isAuthenticated || (user?.role !== 'admin' && user?.role !== 'employee')) return null;

  return (
    <>
      <MissionControlBackground />
      <div className="relative min-h-screen w-full text-neutral-100 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* Header */}
          <header
            className="relative rounded-2xl border overflow-hidden p-6"
            style={{ borderColor: `${PREP_GOLD}33`, backgroundColor: 'rgba(10,10,10,0.8)' }}
          >
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top, ${PREP_GOLD}22, transparent 60%)` }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 10px rgb(52 211 153)' }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400">Admin Console</span>
                <Radio className="w-3 h-3 text-emerald-400/70 ml-1" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-1">The Amazon Syndicate</p>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-none"
                  style={{ textShadow: `0 0 18px ${PREP_GOLD}55, 0 0 40px ${PREP_GOLD}33` }}>
                PREP OPS CENTER
              </h1>
            </div>
          </header>

          {/* Stats */}
          {stats && (
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox color={PREP_GOLD} icon={<Package className="w-4 h-4" />} label="Active" value={stats.activeShipments} />
              <StatBox color="#22C55E" icon={<Truck className="w-4 h-4" />} label="Units Today" value={stats.unitsReceivedToday}
                sub={`${stats.unitsReceivedThisWeek} this week`} />
              <StatBox color="#3B82F6" icon={<DollarSign className="w-4 h-4" />} label="Pending $" value={`$${stats.pendingInvoiceTotal.toFixed(2)}`} />
              <StatBox color="#EF4444" icon={<AlertCircle className="w-4 h-4" />} label="Need Attention" value={stats.shipmentsNeedingAttention}
                sub="received, not invoiced" />
            </section>
          )}

          {/* Filters */}
          <section className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-1.5 flex-1 min-w-[260px] bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-neutral-500" />
              <input
                placeholder="Search by client, company, supplier, or PO…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | PrepStatus)}
              className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs"
            >
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABEL) as PrepStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </section>

          {/* Table */}
          <section className="rounded-2xl border overflow-hidden"
            style={{ borderColor: `${PREP_GOLD}33`, backgroundColor: 'rgba(10,10,15,0.6)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-neutral-500 border-b border-white/[0.08]">
                    <th className="text-left py-3 px-4">Client</th>
                    <th className="text-left py-3 px-4">Company</th>
                    <th className="text-left py-3 px-4">Supplier</th>
                    <th className="text-left py-3 px-4">PO</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Exp / Rec</th>
                    <th className="text-left py-3 px-4">ETA</th>
                    <th className="text-left py-3 px-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-neutral-500">No shipments match filters.</td></tr>
                  ) : filtered.map((s) => {
                    const name = [s.owner?.firstname, s.owner?.lastname].filter(Boolean).join(' ') || s.owner?.email;
                    return (
                      <tr key={s.id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-colors"
                        onClick={() => { setDrawerId(s.id); setDrawerOpen(true); }}>
                        <td className="py-2.5 px-4 text-neutral-200">{name}</td>
                        <td className="py-2.5 px-4 text-neutral-400">{s.company?.name ?? '—'}</td>
                        <td className="py-2.5 px-4 text-neutral-200">{s.supplier_name}</td>
                        <td className="py-2.5 px-4 text-neutral-400">{s.po_number ?? '—'}</td>
                        <td className="py-2.5 px-4"><StatusBadge status={s.status} /></td>
                        <td className="py-2.5 px-4 text-right tabular-nums">
                          <span className="text-neutral-400">{s.unit_count_expected ?? '—'}</span>
                          <span className="text-neutral-600 mx-1">/</span>
                          <span style={{ color: PREP_GOLD }}>{s.unit_count_received ?? '—'}</span>
                        </td>
                        <td className="py-2.5 px-4 text-neutral-400 tabular-nums">{s.estimated_arrival ?? '—'}</td>
                        <td className="py-2.5 px-4 text-neutral-500 tabular-nums">{new Date(s.updated_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>

      <AdminShipmentManagementDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        adminUserId={user!.user_id}
        shipmentId={drawerId}
        onChange={reload}
      />
    </>
  );
}

function StatBox({ color, icon, label, value, sub }: { color: string; icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border backdrop-blur-md p-4 relative overflow-hidden"
      style={{ borderColor: `${color}55`, backgroundColor: 'rgba(10,10,15,0.6)', boxShadow: `0 0 18px ${color}22` }}>
      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
      <div className="pl-2 flex items-start gap-2">
        <div className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}1a`, borderColor: `${color}66`, color }}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
          <div className="text-xl font-black tabular-nums" style={{ color }}>{value}</div>
          {sub && <div className="text-[10px] text-neutral-500 tabular-nums">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
