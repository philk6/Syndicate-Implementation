'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS, PageShell, PageHeader, DsCard, DsButton, DsInput, SectionLabel, DsStatusPill,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsEmpty,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  TASK_LABELS, TASK_TYPES, type TaskType, BUSINESS_TZ,
  formatDuration, hoursBetween, formatZonedTime, formatZonedDate,
  payPeriodStart, payPeriodEnd,
} from '@/lib/timeTracking';
import { RefreshCw, UserCog, Activity, ClipboardList, FileText, Package as PackageIcon, Pencil, Trash2, Download, Power, CircleDollarSign, ArrowLeft } from 'lucide-react';

type Tab = 'live' | 'roster' | 'hours' | 'by-order' | 'edit';

function toBusinessDateInput(d: Date): string {
  // Best-effort YYYY-MM-DD for the input — uses the browser's local tz. Close
  // enough for admin pickers; backend interprets the date as Chicago.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminEmployeesPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('live');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
    if (!authLoading && user && user.role !== 'admin') router.push('/dashboard');
  }, [authLoading, isAuthenticated, user, router]);

  if (authLoading) return <PageLoadingSpinner />;
  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <PageShell>
      <PageHeader
        label="Admin"
        title="Employees"
        subtitle={`Warehouse staff + time tracking · ${BUSINESS_TZ}`}
        accent={DS.teal}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: 'live',     label: 'Live Status',      icon: Activity },
          { id: 'roster',   label: 'Roster',           icon: UserCog },
          { id: 'hours',    label: 'Hours Report',     icon: ClipboardList },
          { id: 'by-order', label: 'Hours by Order',   icon: PackageIcon },
          { id: 'edit',     label: 'Edit Time Entries', icon: FileText },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest font-mono border transition-all"
              style={{
                backgroundColor: active ? `${DS.teal}22` : 'transparent',
                borderColor: active ? `${DS.teal}66` : 'rgba(255,255,255,0.08)',
                color: active ? DS.teal : DS.textDim,
              }}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'live' && <LiveTab />}
      {tab === 'roster' && <RosterTab />}
      {tab === 'hours' && <HoursTab />}
      {tab === 'by-order' && <HoursByOrderTab />}
      {tab === 'edit' && <EditEntriesTab />}
    </PageShell>
  );
}

// ─── Live + Roster share the same /overview endpoint ───────────────────────

interface OverviewEmployee {
  id: string;
  user_id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  active: boolean;
  start_date: string;
  rate: number | null;
  hours_this_week: number;
  open_entry: { id: string; started_at: string; task: TaskType; order_id: number | null } | null;
}

function useOverview() {
  const [data, setData] = useState<OverviewEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('/api/admin/employees/overview', { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setData(json.data.employees);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

function LiveTab() {
  const { data, loading, error, reload } = useOverview();
  const [, setTick] = useState(0);

  // Auto-refresh every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => reload(), 30000);
    return () => clearInterval(t);
  }, [reload]);

  // Tick every 15s for live duration display.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const liveRows = useMemo(() =>
    data.filter((e) => e.open_entry).sort((a, b) => {
      const aStart = new Date(a.open_entry!.started_at).getTime();
      const bStart = new Date(b.open_entry!.started_at).getTime();
      return aStart - bStart; // longest first (oldest start time)
    }), [data]);

  if (loading) return <PageLoadingSpinner />;
  if (error) return <ErrorCard message={error} onRetry={reload} />;

  return (
    <section>
      <SectionLabel accent={DS.teal}>Currently Clocked In</SectionLabel>
      <DsButton variant="ghost" onClick={reload} className="mb-2">
        <RefreshCw className="w-3.5 h-3.5" /> Refresh
      </DsButton>
      {liveRows.length === 0 ? (
        <DsEmpty icon={<Activity className="w-6 h-6" />} title="Nobody clocked in" body="Employees appear here live when they clock in." />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>Employee</DsTh>
            <DsTh>Task</DsTh>
            <DsTh>Order</DsTh>
            <DsTh>Clocked In</DsTh>
            <DsTh className="text-right">Duration</DsTh>
          </DsThead>
          <tbody>
            {liveRows.map((e) => {
              const start = new Date(e.open_entry!.started_at);
              const hrs = hoursBetween(start, null);
              return (
                <DsTr key={e.id}>
                  <DsTd className="font-semibold text-white">{e.first_name} {e.last_name}</DsTd>
                  <DsTd><DsStatusPill label={TASK_LABELS[e.open_entry!.task]} color={DS.orange} /></DsTd>
                  <DsTd>{e.open_entry!.order_id ? `#${e.open_entry!.order_id}` : '—'}</DsTd>
                  <DsTd className="tabular-nums text-neutral-400">{formatZonedTime(start)}</DsTd>
                  <DsTd className="text-right tabular-nums font-mono text-teal-300">{formatDuration(hrs * 3600000)}</DsTd>
                </DsTr>
              );
            })}
          </tbody>
        </DsTable>
      )}
    </section>
  );
}

function RosterTab() {
  const { data, loading, error, reload } = useOverview();
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [actingOn, setActingOn] = useState<string | null>(null);

  const rows = useMemo(() => {
    return data
      .filter((e) => (filter === 'all' ? true : filter === 'active' ? e.active : !e.active))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  }, [data, filter]);

  const deactivate = async (employeeId: string, active: boolean) => {
    setActingOn(employeeId);
    try {
      await fetch(`/api/admin/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });
      await reload();
    } finally {
      setActingOn(null);
    }
  };

  const setRate = async (employeeId: string) => {
    const raw = window.prompt('New hourly rate (USD):');
    if (!raw) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      window.alert('Enter a non-negative number.');
      return;
    }
    setActingOn(employeeId);
    try {
      await fetch(`/api/admin/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourlyRate: n }),
      });
      await reload();
    } finally {
      setActingOn(null);
    }
  };

  if (loading) return <PageLoadingSpinner />;
  if (error) return <ErrorCard message={error} onRetry={reload} />;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {(['active', 'inactive', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest font-mono border"
            style={{
              backgroundColor: filter === f ? `${DS.orange}22` : 'transparent',
              borderColor: filter === f ? `${DS.orange}66` : 'rgba(255,255,255,0.08)',
              color: filter === f ? DS.orange : DS.textDim,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <DsEmpty icon={<UserCog className="w-6 h-6" />} title="No employees" body="Create one from Manage Users → Create Employee." />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>Name</DsTh>
            <DsTh>Email</DsTh>
            <DsTh className="text-right">Rate</DsTh>
            <DsTh>Start</DsTh>
            <DsTh className="text-right">Hours (week)</DsTh>
            <DsTh>Status</DsTh>
            <DsTh className="text-right">Actions</DsTh>
          </DsThead>
          <tbody>
            {rows.map((e) => (
              <DsTr key={e.id}>
                <DsTd className="font-semibold text-white">{e.first_name} {e.last_name}</DsTd>
                <DsTd className="text-neutral-400">{e.email ?? '—'}</DsTd>
                <DsTd className="text-right tabular-nums">{e.rate != null ? `$${Number(e.rate).toFixed(2)}` : '—'}</DsTd>
                <DsTd className="text-neutral-400 text-xs">{e.start_date}</DsTd>
                <DsTd className="text-right tabular-nums">{e.hours_this_week.toFixed(2)}</DsTd>
                <DsTd>
                  <DsStatusPill label={e.active ? 'Active' : 'Inactive'} color={e.active ? DS.teal : DS.muted} />
                </DsTd>
                <DsTd className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <DsButton
                      variant="ghost"
                      onClick={() => setRate(e.id)}
                      disabled={actingOn === e.id}
                    >
                      <CircleDollarSign className="w-3.5 h-3.5" /> Rate
                    </DsButton>
                    <DsButton
                      variant={e.active ? 'danger' : 'secondary'}
                      accent={e.active ? DS.red : DS.teal}
                      onClick={() => deactivate(e.id, e.active)}
                      disabled={actingOn === e.id}
                    >
                      <Power className="w-3.5 h-3.5" /> {e.active ? 'Deactivate' : 'Reactivate'}
                    </DsButton>
                  </div>
                </DsTd>
              </DsTr>
            ))}
          </tbody>
        </DsTable>
      )}
    </section>
  );
}

// ─── Hours Report tab ──────────────────────────────────────────────────────

function HoursTab() {
  const defaultFrom = toBusinessDateInput(payPeriodStart());
  const defaultTo = toBusinessDateInput(new Date(payPeriodEnd().getTime()));
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    rows: Array<{
      employee_id: string; first_name: string; last_name: string; email: string; active: boolean;
      total_hours: number; by_task: Record<TaskType, number>; hourly_rate: number; gross_pay: number;
      unresolved_entries: number;
    }>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/employees/hours-report?from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setReport(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    window.open(`/api/admin/employees/payroll-export?from=${from}&to=${to}`, '_blank');
  };

  return (
    <section className="space-y-3">
      <DsCard className="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <DsInput label="From" type="date" value={from} onChange={setFrom} />
          <DsInput label="To"   type="date" value={to}   onChange={setTo} />
          <DsButton onClick={load} variant="secondary" accent={DS.teal}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </DsButton>
          <div className="flex-1" />
          <DsButton onClick={exportCsv} accent={DS.orange}>
            <Download className="w-3.5 h-3.5" /> Export Payroll CSV
          </DsButton>
        </div>
      </DsCard>

      {loading && <PageLoadingSpinner />}
      {error && <ErrorCard message={error} onRetry={load} />}
      {report && !loading && !error && (
        report.rows.length === 0 ? (
          <DsEmpty icon={<ClipboardList className="w-6 h-6" />} title="No hours logged" body="No time entries found for this range." />
        ) : (
          <div className="overflow-x-auto">
            <DsTable>
              <DsThead>
                <DsTh>Employee</DsTh>
                <DsTh className="text-right">Total</DsTh>
                {TASK_TYPES.map((t) => <DsTh key={t} className="text-right">{TASK_LABELS[t]}</DsTh>)}
                <DsTh className="text-right">Rate</DsTh>
                <DsTh className="text-right">Gross</DsTh>
              </DsThead>
              <tbody>
                {report.rows.map((r) => (
                  <DsTr key={r.employee_id}>
                    <DsTd className="font-semibold text-white">
                      {r.first_name} {r.last_name}
                      {!r.active && <span className="ml-2 text-[10px] text-neutral-500 uppercase">(inactive)</span>}
                      {r.unresolved_entries > 0 && (
                        <span className="ml-2 text-[10px] text-rose-400 uppercase">
                          {r.unresolved_entries} unresolved
                        </span>
                      )}
                    </DsTd>
                    <DsTd className="text-right tabular-nums font-bold">{r.total_hours.toFixed(2)}</DsTd>
                    {TASK_TYPES.map((t) => (
                      <DsTd key={t} className="text-right tabular-nums text-neutral-400">
                        {r.by_task[t] > 0 ? r.by_task[t].toFixed(2) : '—'}
                      </DsTd>
                    ))}
                    <DsTd className="text-right tabular-nums">${Number(r.hourly_rate).toFixed(2)}</DsTd>
                    <DsTd className="text-right tabular-nums font-bold text-teal-300">${r.gross_pay.toFixed(2)}</DsTd>
                  </DsTr>
                ))}
              </tbody>
            </DsTable>
          </div>
        )
      )}
    </section>
  );
}

// ─── Hours by Order tab ────────────────────────────────────────────────────

function HoursByOrderTab() {
  const [from, setFrom] = useState(toBusinessDateInput(payPeriodStart()));
  const [to, setTo] = useState(toBusinessDateInput(new Date(payPeriodEnd().getTime())));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{
    order_id: number; total_hours: number;
    per_employee: Array<{ employee_id: string; name: string; total: number; byTask: Record<string, number> }>;
  }> | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/employees/hours-by-order?from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setRows(json.data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="space-y-3">
      <DsCard className="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <DsInput label="From" type="date" value={from} onChange={setFrom} />
          <DsInput label="To"   type="date" value={to}   onChange={setTo} />
          <DsButton onClick={load} variant="secondary" accent={DS.teal}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </DsButton>
        </div>
      </DsCard>

      {loading && <PageLoadingSpinner />}
      {error && <ErrorCard message={error} onRetry={load} />}
      {rows && !loading && !error && (
        rows.length === 0 ? (
          <DsEmpty icon={<PackageIcon className="w-6 h-6" />} title="No labor hours" body="No time entries tagged to an order in this range." />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <DsCard key={r.order_id} className="p-4">
                <button
                  onClick={() => setExpanded((x) => ({ ...x, [r.order_id]: !x[r.order_id] }))}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="font-mono uppercase tracking-widest text-sm font-bold text-white">
                    Order #{r.order_id}
                  </span>
                  <span className="font-mono tabular-nums text-teal-300">{r.total_hours.toFixed(2)} h</span>
                </button>
                {expanded[r.order_id] && (
                  <div className="mt-3 pl-3 border-l border-white/[0.08] space-y-2">
                    {r.per_employee.map((pe) => (
                      <div key={pe.employee_id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-white font-sans">{pe.name}</span>
                        <div className="flex items-center gap-3">
                          {Object.entries(pe.byTask).map(([t, h]) => (
                            <span key={t} className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                              {TASK_LABELS[t as TaskType] ?? t}: {(h as number).toFixed(2)}
                            </span>
                          ))}
                          <span className="font-mono tabular-nums text-teal-300">{pe.total.toFixed(2)}h</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DsCard>
            ))}
          </div>
        )
      )}
    </section>
  );
}

// ─── Edit Time Entries tab ─────────────────────────────────────────────────

interface EditEntry {
  id: string; started_at: string; ended_at: string | null; task: TaskType;
  order_id: number | null; note: string | null;
}

function EditEntriesTab() {
  const { data: overview } = useOverview();
  const [employeeId, setEmployeeId] = useState<string>('');
  const [from, setFrom] = useState(toBusinessDateInput(payPeriodStart()));
  const [to, setTo] = useState(toBusinessDateInput(new Date(payPeriodEnd().getTime())));
  const [entries, setEntries] = useState<EditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditEntry | null>(null);

  // Default to first employee once overview loads.
  useEffect(() => {
    if (!employeeId && overview.length) setEmployeeId(overview[0].id);
  }, [overview, employeeId]);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/employees/time-entries?employeeId=${employeeId}&from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setEntries(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [employeeId, from, to]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    if (!editing) return;
    await fetch(`/api/admin/time-entries/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        started_at: editing.started_at,
        ended_at: editing.ended_at,
        task: editing.task,
        order_id: editing.order_id,
        note: editing.note,
      }),
    });
    setEditing(null);
    load();
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this time entry? A snapshot will be kept in the audit log.')) return;
    await fetch(`/api/admin/time-entries/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <section className="space-y-3">
      <DsCard className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Employee</span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full text-sm text-white rounded-lg px-3 py-2 border font-mono"
              style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {overview.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}{!e.active ? ' (inactive)' : ''}</option>
              ))}
            </select>
          </label>
          <DsInput label="From" type="date" value={from} onChange={setFrom} />
          <DsInput label="To"   type="date" value={to}   onChange={setTo} />
          <div className="flex items-end">
            <DsButton onClick={load} variant="secondary" accent={DS.teal}>
              <RefreshCw className="w-3.5 h-3.5" /> Load
            </DsButton>
          </div>
        </div>
      </DsCard>

      {loading && <PageLoadingSpinner />}
      {error && <ErrorCard message={error} onRetry={load} />}
      {!loading && !error && (
        entries.length === 0 ? (
          <DsEmpty icon={<FileText className="w-6 h-6" />} title="No entries" body="No time entries in this range." />
        ) : (
          <DsTable>
            <DsThead>
              <DsTh>Date</DsTh>
              <DsTh>Start</DsTh>
              <DsTh>End</DsTh>
              <DsTh>Duration</DsTh>
              <DsTh>Task</DsTh>
              <DsTh>Order</DsTh>
              <DsTh>Note</DsTh>
              <DsTh>{''}</DsTh>
            </DsThead>
            <tbody>
              {entries.map((e) => {
                const hrs = e.ended_at ? hoursBetween(new Date(e.started_at), new Date(e.ended_at)) : null;
                return (
                  <DsTr key={e.id}>
                    <DsTd>{formatZonedDate(new Date(e.started_at))}</DsTd>
                    <DsTd className="tabular-nums">{formatZonedTime(new Date(e.started_at))}</DsTd>
                    <DsTd className="tabular-nums">{e.ended_at ? formatZonedTime(new Date(e.ended_at)) : <span className="text-rose-400">open</span>}</DsTd>
                    <DsTd className="tabular-nums">{hrs != null ? formatDuration(hrs * 3600000) : '—'}</DsTd>
                    <DsTd><DsStatusPill label={TASK_LABELS[e.task]} color={DS.orange} /></DsTd>
                    <DsTd>{e.order_id ? `#${e.order_id}` : '—'}</DsTd>
                    <DsTd className="max-w-[220px] truncate text-neutral-400 text-xs">{e.note ?? '—'}</DsTd>
                    <DsTd className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <DsButton variant="ghost" onClick={() => setEditing({ ...e })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </DsButton>
                        <DsButton variant="danger" onClick={() => deleteEntry(e.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </DsButton>
                      </div>
                    </DsTd>
                  </DsTr>
                );
              })}
            </tbody>
          </DsTable>
        )
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <DsCard className="p-5 w-full max-w-lg" accent={DS.teal}>
            <SectionLabel accent={DS.teal}>Edit Time Entry</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DsInput
                label="Start (ISO)"
                value={editing.started_at.slice(0, 16)}
                onChange={(v) => setEditing({ ...editing, started_at: new Date(v).toISOString() })}
                type="datetime-local"
              />
              <DsInput
                label="End (ISO, blank = open)"
                value={editing.ended_at ? editing.ended_at.slice(0, 16) : ''}
                onChange={(v) => setEditing({ ...editing, ended_at: v ? new Date(v).toISOString() : null })}
                type="datetime-local"
              />
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Task</span>
                <select
                  value={editing.task}
                  onChange={(e) => setEditing({ ...editing, task: e.target.value as TaskType })}
                  className="w-full text-sm text-white rounded-lg px-3 py-2 border font-mono"
                  style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                >
                  {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_LABELS[t]}</option>)}
                </select>
              </label>
              <DsInput
                label="Order ID (blank for none)"
                value={editing.order_id == null ? '' : String(editing.order_id)}
                onChange={(v) => setEditing({ ...editing, order_id: v ? Number(v) : null })}
                type="number"
              />
              <DsInput
                label="Note"
                value={editing.note ?? ''}
                onChange={(v) => setEditing({ ...editing, note: v })}
                className="md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <DsButton variant="ghost" onClick={() => setEditing(null)}>
                <ArrowLeft className="w-3.5 h-3.5" /> Cancel
              </DsButton>
              <DsButton onClick={saveEdit} accent={DS.teal}>Save</DsButton>
            </div>
          </DsCard>
        </div>
      )}
    </section>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <DsCard className="p-5" accent={DS.red}>
      <p className="text-sm text-rose-400 font-sans">{message}</p>
      <DsButton variant="ghost" onClick={onRetry} className="mt-3">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </DsButton>
    </DsCard>
  );
}
