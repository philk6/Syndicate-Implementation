'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Box, Bell, FileText, Receipt, Package, Plus, Radio, Check,
} from 'lucide-react';
import { MissionControlBackground } from '@/components/command-center/MissionControlBackground';
import { ShipmentCard } from '@/components/prep/ShipmentCard';
import { ShipmentDetailDrawer } from '@/components/prep/ShipmentDetailDrawer';
import { SubmitShipmentModal } from '@/components/prep/SubmitShipmentModal';
import { PREP_GOLD, INVOICE_STATUS_COLOR, type PrepStatus } from '@/components/prep/prepTheme';
import { StatusBadge } from '@/components/prep/StatusBadge';
import {
  getMyShipments, getMyInvoices, getMyNotifications,
  markNotificationRead, markAllNotificationsRead, cancelShipment,
  markInvoicePaid, getSignedDocumentUrl,
} from '@/lib/actions/prep';

type Tab = 'shipments' | 'invoices' | 'documents' | 'notifications';

interface ShipmentRow {
  id: number;
  supplier_name: string;
  po_number: string | null;
  tracking_number: string | null;
  status: PrepStatus;
  estimated_arrival: string | null;
  unit_count_expected: number | null;
  unit_count_received: number | null;
  updated_at: string;
  items: Array<{ id: number; product_name: string; units_expected: number; units_received: number }>;
  documents: Array<{ id: number; document_type: string; file_name: string; file_url: string; created_at: string }>;
  invoices: Array<{ id: number; invoice_number: string; status: string; total: number }>;
}

interface InvoiceRow {
  id: number; invoice_number: string; status: string; subtotal: number; tax: number; total: number;
  due_date: string | null; paid_at: string | null; notes: string | null; created_at: string;
  line_items: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
  shipment: { id: number; supplier_name: string; po_number: string | null } | null;
}

interface NotificationRow {
  id: number; type: string; message: string; is_read: boolean; created_at: string; shipment_id: number | null;
}

export default function PrepPortalPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('shipments');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'complete'>('all');
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerShipmentId, setDrawerShipmentId] = useState<number | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.user_id) return;
    setLoading(true);
    try {
      const [s, i, n] = await Promise.all([
        getMyShipments(user.user_id),
        getMyInvoices(user.user_id),
        getMyNotifications(user.user_id),
      ]);
      setShipments(s as ShipmentRow[]);
      setInvoices(i as InvoiceRow[]);
      setNotifications(n as NotificationRow[]);
    } catch (err) {
      console.error('Prep load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.push('/login'); return; }
    // Gate: must have 1-on-1 membership or be admin
    const hasAccess = user?.role === 'admin' || (user as { has_1on1_membership?: boolean })?.has_1on1_membership === true;
    if (!hasAccess) { router.push('/unauthorized'); return; }
    if (!user?.user_id) return;
    reload();
  }, [authLoading, isAuthenticated, user, router, reload]);

  const activeShipmentCount = useMemo(
    () => shipments.filter((s) => !['complete', 'shipped_to_amazon', 'cancelled'].includes(s.status)).length,
    [shipments],
  );
  const pendingInvoiceCount = useMemo(
    () => invoices.filter((i) => i.status === 'pending' || i.status === 'sent').length,
    [invoices],
  );
  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const filteredShipments = useMemo(() => {
    if (statusFilter === 'all') return shipments;
    if (statusFilter === 'active') return shipments.filter((s) => !['complete', 'shipped_to_amazon', 'cancelled'].includes(s.status));
    return shipments.filter((s) => s.status === 'complete' || s.status === 'shipped_to_amazon');
  }, [shipments, statusFilter]);

  const allDocuments = useMemo(() => {
    return shipments.flatMap((s) =>
      s.documents.map((d) => ({ ...d, shipment_id: s.id, supplier_name: s.supplier_name })),
    ).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [shipments]);

  if (authLoading || loading) {
    return (
      <>
        <MissionControlBackground />
        <PageLoadingSpinner />
      </>
    );
  }
  if (!isAuthenticated || !user) return null;

  const openDrawer = (id: number) => { setDrawerShipmentId(id); setDrawerOpen(true); };

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
            <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative inline-flex items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 10px rgb(52 211 153)' }} />
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400">Warehouse Online</span>
                  <Radio className="w-3 h-3 text-emerald-400/70 ml-1" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-1">The Amazon Syndicate · FBA Prep</p>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-none"
                    style={{ textShadow: `0 0 18px ${PREP_GOLD}55, 0 0 40px ${PREP_GOLD}33` }}>
                  PREP PORTAL
                </h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatPill color={PREP_GOLD} label="Active" value={activeShipmentCount} icon={<Package className="w-3.5 h-3.5" />} />
                <StatPill color="#EAB308" label="Pending" value={pendingInvoiceCount} icon={<Receipt className="w-3.5 h-3.5" />} />
                <StatPill color="#EF4444" label="Unread" value={unreadCount} icon={<Bell className="w-3.5 h-3.5" />} />
                <button
                  onClick={() => setSubmitOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest cursor-pointer"
                  style={{ backgroundColor: PREP_GOLD, color: '#0a0a0a', boxShadow: `0 0 18px ${PREP_GOLD}55` }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Submit New Shipment
                </button>
              </div>
            </div>
          </header>

          {/* Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <TabBtn active={tab === 'shipments'} onClick={() => setTab('shipments')} icon={<Package className="w-3.5 h-3.5" />}>
              My Shipments
            </TabBtn>
            <TabBtn active={tab === 'invoices'} onClick={() => setTab('invoices')} icon={<Receipt className="w-3.5 h-3.5" />}>
              Invoices
            </TabBtn>
            <TabBtn active={tab === 'documents'} onClick={() => setTab('documents')} icon={<FileText className="w-3.5 h-3.5" />}>
              Documents
            </TabBtn>
            <TabBtn active={tab === 'notifications'} onClick={() => setTab('notifications')} icon={<Bell className="w-3.5 h-3.5" />} badge={unreadCount}>
              Notifications
            </TabBtn>
          </div>

          {/* Content */}
          {tab === 'shipments' && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                {(['all', 'active', 'complete'] as const).map((k) => (
                  <button key={k} onClick={() => setStatusFilter(k)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border cursor-pointer"
                    style={{
                      backgroundColor: statusFilter === k ? `${PREP_GOLD}1a` : 'rgba(255,255,255,0.03)',
                      borderColor: statusFilter === k ? PREP_GOLD : 'rgba(255,255,255,0.08)',
                      color: statusFilter === k ? PREP_GOLD : '#a3a3a3',
                    }}>
                    {k}
                  </button>
                ))}
              </div>
              {filteredShipments.length === 0 ? (
                <EmptyState icon={<Box className="w-7 h-7" />}
                  title="No shipments yet"
                  body="Submit your first inbound shipment to get started." />
              ) : (
                filteredShipments.map((s) => (
                  <ShipmentCard
                    key={s.id}
                    shipment={s}
                    onView={() => openDrawer(s.id)}
                    onEdit={s.status === 'submitted' ? () => openDrawer(s.id) : undefined}
                    onCancel={s.status === 'submitted' ? async () => {
                      if (!confirm('Cancel this shipment?')) return;
                      await cancelShipment(user.user_id, s.id); reload();
                    } : undefined}
                  />
                ))
              )}
            </section>
          )}

          {tab === 'invoices' && (
            <section className="space-y-3">
              {invoices.length === 0 ? (
                <EmptyState icon={<Receipt className="w-7 h-7" />} title="No invoices" body="Invoices will appear here once your shipments are processed." />
              ) : (
                invoices.map((inv) => <InvoiceCard key={inv.id} invoice={inv} userId={user.user_id} onChange={reload} />)
              )}
            </section>
          )}

          {tab === 'documents' && (
            <section className="rounded-2xl border p-4" style={{ borderColor: `${PREP_GOLD}33`, backgroundColor: 'rgba(10,10,15,0.6)' }}>
              {allDocuments.length === 0 ? (
                <EmptyState icon={<FileText className="w-7 h-7" />} title="No documents" body="Upload POs, BOLs, and receiving photos from inside any shipment." />
              ) : (
                <ul className="space-y-1.5">
                  {allDocuments.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.05] bg-white/[0.02]">
                      <FileText className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="text-xs text-neutral-200 truncate flex-1">{d.file_name}</span>
                      <span className="text-[10px] text-neutral-500">{d.supplier_name}</span>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500">{d.document_type.replace(/_/g, ' ')}</span>
                      <button
                        onClick={async () => {
                          try { const url = await getSignedDocumentUrl(d.file_url); window.open(url, '_blank', 'noopener'); }
                          catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
                        }}
                        className="text-neutral-400 hover:text-[#FFD700] cursor-pointer text-[10px] uppercase tracking-widest font-bold"
                      >Open</button>
                      <button onClick={() => openDrawer(d.shipment_id)} className="text-neutral-400 hover:text-[#FFD700] cursor-pointer text-[10px] uppercase tracking-widest font-bold">Ship #{d.shipment_id}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'notifications' && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Recent Activity · {notifications.length}</p>
                {unreadCount > 0 && (
                  <button
                    onClick={async () => { await markAllNotificationsRead(user.user_id); reload(); }}
                    className="text-[10px] uppercase tracking-widest font-bold cursor-pointer"
                    style={{ color: PREP_GOLD }}
                  >
                    <Check className="w-3 h-3 inline mr-0.5" /> Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <EmptyState icon={<Bell className="w-7 h-7" />} title="No notifications" body="Warehouse updates and messages will appear here." />
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={async () => {
                      if (!n.is_read) { await markNotificationRead(user.user_id, n.id); }
                      if (n.shipment_id) openDrawer(n.shipment_id);
                      reload();
                    }}
                    className="relative rounded-lg border px-4 py-2.5 cursor-pointer transition-colors"
                    style={{
                      borderColor: n.is_read ? 'rgba(255,255,255,0.06)' : `${PREP_GOLD}55`,
                      backgroundColor: n.is_read ? 'rgba(255,255,255,0.02)' : `${PREP_GOLD}0d`,
                    }}
                  >
                    {!n.is_read && <span className="absolute top-0 left-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: PREP_GOLD, boxShadow: `0 0 8px ${PREP_GOLD}` }} />}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: n.is_read ? '#a3a3a3' : PREP_GOLD }}>
                        {n.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-neutral-500 tabular-nums">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-neutral-200 mt-0.5">{n.message}</p>
                  </div>
                ))
              )}
            </section>
          )}

        </div>
      </div>

      {/* Modals */}
      <SubmitShipmentModal
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        userId={user.user_id}
        onCreated={reload}
      />
      <ShipmentDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        userId={user.user_id}
        shipmentId={drawerShipmentId}
        onChange={reload}
      />
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, badge, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; badge?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer relative"
      style={{
        backgroundColor: active ? `${PREP_GOLD}1a` : 'rgba(255,255,255,0.03)',
        borderColor: active ? PREP_GOLD : 'rgba(255,255,255,0.08)',
        color: active ? PREP_GOLD : '#a3a3a3',
        boxShadow: active ? `0 0 18px ${PREP_GOLD}33` : 'none',
      }}
    >
      {icon}
      {children}
      {!!badge && badge > 0 && (
        <span className="ml-1 inline-flex items-center justify-center rounded-full text-[9px] font-black h-4 min-w-[1rem] px-1"
          style={{ backgroundColor: '#EF4444', color: 'white' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function StatPill({ color, label, value, icon }: { color: string; label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div
      className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold"
      style={{ backgroundColor: `${color}12`, borderColor: `${color}44`, color }}
    >
      {icon}
      <span className="tabular-nums">{value}</span>
      <span className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold ml-0.5">{label}</span>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 text-neutral-500">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1">{title}</h3>
      <p className="text-xs text-neutral-500 max-w-[320px] font-sans">{body}</p>
    </div>
  );
}

function InvoiceCard({ invoice, userId, onChange }: { invoice: InvoiceRow; userId: string; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const color = INVOICE_STATUS_COLOR[invoice.status] ?? '#6B7280';

  const handlePay = async () => {
    if (!confirm(`Mark ${invoice.invoice_number} as paid?`)) return;
    try { await markInvoicePaid(userId, invoice.id); onChange(); }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: `${color}55`, backgroundColor: 'rgba(10,10,15,0.6)' }}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 p-4 text-left cursor-pointer">
        <Receipt className="w-4 h-4 shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-black text-white">{invoice.invoice_number}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>{invoice.status}</span>
            {invoice.shipment && <span className="text-[11px] text-neutral-500">· {invoice.shipment.supplier_name}</span>}
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">
            {invoice.due_date ? `Due ${invoice.due_date}` : 'Due on receipt'} · Issued {new Date(invoice.created_at).toLocaleDateString()}
          </div>
        </div>
        <span className="text-base font-black tabular-nums" style={{ color: PREP_GOLD }}>${Number(invoice.total).toFixed(2)}</span>
      </button>
      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-3 space-y-1.5">
          {invoice.line_items.length === 0 ? (
            <p className="text-xs text-neutral-500">No line items.</p>
          ) : (
            <ul className="divide-y divide-white/[0.03]">
              {invoice.line_items.map((li, idx) => (
                <li key={idx} className="flex justify-between py-1.5 text-xs">
                  <span className="text-neutral-300">{li.description} × {li.quantity}</span>
                  <span className="tabular-nums text-neutral-200">${Number(li.total).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between text-[11px] pt-1 border-t border-white/[0.05]">
            <span className="text-neutral-500">Subtotal</span>
            <span className="tabular-nums">${Number(invoice.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-500">Tax</span>
            <span className="tabular-nums">${Number(invoice.tax).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span>Total</span>
            <span className="tabular-nums" style={{ color: PREP_GOLD }}>${Number(invoice.total).toFixed(2)}</span>
          </div>
          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <button
              onClick={handlePay}
              className="mt-2 w-full py-2 rounded-lg text-[10px] uppercase tracking-widest font-bold border cursor-pointer"
              style={{ borderColor: '#22C55E', color: '#22C55E', backgroundColor: '#22C55E1a' }}
            >
              Mark as Paid
            </button>
          )}
        </div>
      )}
    </div>
  );
}
