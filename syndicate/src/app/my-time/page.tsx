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
  BUSINESS_TZ, TASK_LABELS, TASK_TYPES, TASKS_REQUIRING_ORDER, type TaskType,
  formatDuration, hoursBetween, formatZonedTime, formatZonedDate,
} from '@/lib/timeTracking';
import { Clock, Play, Pause, RefreshCw, X, ArrowRightLeft, Timer } from 'lucide-react';

interface OpenEntry {
  id: string;
  started_at: string;
  ended_at: string | null;
  task: TaskType;
  order_id: number | null;
  project_id: string | null;
  note: string | null;
}

interface MyTimeState {
  employee: { id: string; first_name: string; last_name: string; active: boolean; employment_start_date: string; team_id: string; va_profile: string | null } | null;
  isVa: boolean;
  openEntry: OpenEntry | null;
  today: OpenEntry[];
  week: OpenEntry[];
  rate: number | null;
  orders: Array<{ order_id: number; status: string }>;
  projects: Array<{ id: string; name: string; description: string | null; active: boolean }>;
  todayReport: {
    id: string;
    accomplishments: string;
    stuck_on: string | null;
    tomorrow_plan: string | null;
    submitted_at: string;
  } | null;
}

export default function MyTimePage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [state, setState] = useState<MyTimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [modalMode, setModalMode] = useState<'clock-in' | 'switch' | null>(null);
  const [task, setTask] = useState<TaskType>('prep');
  const [orderId, setOrderId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // VA end-of-day report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState({ accomplishments: '', stuck_on: '', tomorrow_plan: '' });
  const [reportError, setReportError] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
    if (!authLoading && user && user.role !== 'admin' && user.role !== 'employee' && user.role !== 'va') {
      router.push('/dashboard');
    }
  }, [authLoading, isAuthenticated, user, router]);

  const load = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('/api/my-time/state', { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setState(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  // Tick every 15 seconds so the "clocked in for X" duration updates.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const openModal = (mode: 'clock-in' | 'switch') => {
    setModalMode(mode);
    setTask('prep');
    setOrderId('');
    setProjectId('');
    setNote('');
    setModalError(null);
  };

  const submitModal = async () => {
    const tagRequired = TASKS_REQUIRING_ORDER.includes(task);
    if (state?.isVa) {
      if (tagRequired && !projectId) {
        setModalError('This task type requires a project.');
        return;
      }
    } else {
      if (tagRequired && !orderId) {
        setModalError('This task type requires an order.');
        return;
      }
    }
    setSubmitting(true);
    setModalError(null);
    try {
      const body: Record<string, unknown> = { task, note: note.trim() || null };
      if (state?.isVa) body.projectId = projectId || null;
      else body.orderId = orderId ? Number(orderId) : null;
      const url = modalMode === 'switch' ? '/api/my-time/switch-task' : '/api/my-time/clock-in';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error ?? 'Failed');
        return;
      }
      setModalMode(null);
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const employeeClockOut = async () => {
    try {
      await fetch('/api/my-time/clock-out', { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clock out');
    }
  };

  const openVaReportModal = () => {
    // If a report was already submitted today, seed its text so the VA can
    // extend it rather than lose yesterday's prose.
    setReport({
      accomplishments: state?.todayReport?.accomplishments ?? '',
      stuck_on: state?.todayReport?.stuck_on ?? '',
      tomorrow_plan: state?.todayReport?.tomorrow_plan ?? '',
    });
    setReportError(null);
    setReportOpen(true);
  };

  const submitVaClockOut = async () => {
    setReportError(null);
    if (report.accomplishments.trim().length < 20) {
      setReportError('Write at least 20 characters about what you accomplished today.');
      return;
    }
    setSubmittingReport(true);
    try {
      const res = await fetch('/api/my-time/va-clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accomplishments: report.accomplishments.trim(),
          stuck_on: report.stuck_on.trim() || null,
          tomorrow_plan: report.tomorrow_plan.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setReportError(json.error ?? 'Failed');
        return;
      }
      setReportOpen(false);
      const hhmm = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
      setConfirmation(`Logged out at ${hhmm}. Have a good evening.`);
      await load();
      // Auto-dismiss the confirmation after 6s.
      setTimeout(() => setConfirmation(null), 6000);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmittingReport(false);
    }
  };

  const clockOut = () => {
    if (state?.isVa) openVaReportModal();
    else employeeClockOut();
  };

  const openDuration = useMemo(() => {
    if (!state?.openEntry) return null;
    // tick used to force recompute
    void tick;
    return hoursBetween(new Date(state.openEntry.started_at), null);
  }, [state?.openEntry, tick]);

  // ─── Derived week totals ────────────────────────────────────────────────

  const weekStats = useMemo(() => {
    if (!state) return null;
    const byTask: Record<TaskType, number> = {
      prep: 0, shipping: 0, labeling: 0, receiving_order: 0,
      receiving_general: 0, cleaning: 0, break: 0, other: 0,
    };
    let total = 0;
    for (const e of state.week) {
      const hrs = hoursBetween(new Date(e.started_at), e.ended_at ? new Date(e.ended_at) : null);
      byTask[e.task] += hrs;
      total += hrs;
    }
    return { byTask, total };
  }, [state]);

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  if (error) {
    return (
      <PageShell>
        <PageHeader label="Employee" title="My Time" accent={DS.red} />
        <DsCard className="p-5" accent={DS.red}>
          <p className="text-sm text-rose-400 font-sans">{error}</p>
          <DsButton variant="ghost" onClick={load} className="mt-3">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </DsButton>
        </DsCard>
      </PageShell>
    );
  }

  if (!state?.employee) {
    return (
      <PageShell>
        <PageHeader label="Employee" title="My Time" accent={DS.orange} />
        <DsCard className="p-6" accent={DS.orange}>
          <p className="text-sm text-neutral-300 font-sans">
            You don&apos;t have an employee record yet. Only warehouse employees use this page.
          </p>
        </DsCard>
      </PageShell>
    );
  }

  if (!state.employee.active) {
    return (
      <PageShell>
        <PageHeader label="Employee" title="My Time" accent={DS.red} />
        <DsCard className="p-6" accent={DS.red}>
          <p className="text-sm text-white font-sans">Your account is inactive.</p>
          <p className="text-xs text-neutral-400 font-sans mt-1">Contact your admin to reactivate.</p>
        </DsCard>
      </PageShell>
    );
  }

  const projectById = new Map(state.projects.map((p) => [p.id, p]));
  const openTagLabel =
    state.openEntry?.order_id ? `Order #${state.openEntry.order_id}`
    : state.openEntry?.project_id ? (projectById.get(state.openEntry.project_id)?.name ?? 'Project')
    : null;
  const projectedPay = weekStats && state.rate ? weekStats.total * Number(state.rate) : null;

  return (
    <PageShell>
      <PageHeader
        label="Employee"
        title="My Time"
        subtitle={`${state.employee.first_name} ${state.employee.last_name} · ${BUSINESS_TZ}`}
        accent={state.openEntry ? DS.teal : DS.muted}
        right={
          <DsButton variant="ghost" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </DsButton>
        }
      />

      {/* Status banner */}
      {state.openEntry ? (
        <DsCard className="p-6" accent={DS.teal} glow>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-teal-300 mb-1">
                Clocked In
              </p>
              <p className="text-2xl font-black text-white tabular-nums">
                {formatDuration((openDuration ?? 0) * 60 * 60 * 1000)}
                <span className="text-sm font-mono text-neutral-400 ml-3">
                  on {TASK_LABELS[state.openEntry.task]}
                  {openTagLabel ? ` · ${openTagLabel}` : ''}
                </span>
              </p>
              <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-widest font-mono">
                Since {formatZonedTime(new Date(state.openEntry.started_at))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DsButton accent={DS.orange} onClick={() => openModal('switch')}>
                <ArrowRightLeft className="w-3.5 h-3.5" /> Switch Task
              </DsButton>
              <DsButton variant="danger" onClick={clockOut}>
                <Pause className="w-3.5 h-3.5" /> Clock Out
              </DsButton>
            </div>
          </div>
        </DsCard>
      ) : (
        <DsCard className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-500 mb-1">
                Clocked Out
              </p>
              <p className="text-2xl font-black text-neutral-400">Not working right now</p>
            </div>
            <DsButton accent={DS.teal} onClick={() => openModal('clock-in')}>
              <Play className="w-3.5 h-3.5" /> Clock In
            </DsButton>
          </div>
        </DsCard>
      )}

      {/* Today's entries + Week summary */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SectionLabel accent={DS.orange}>Today ({formatZonedDate(new Date())})</SectionLabel>
          {state.today.length === 0 ? (
            <DsEmpty
              icon={<Timer className="w-6 h-6" />}
              title="No entries yet today"
              body="Clock in above to start tracking."
            />
          ) : (
            <DsTable>
              <DsThead>
                <DsTh>Start</DsTh>
                <DsTh>End</DsTh>
                <DsTh>Duration</DsTh>
                <DsTh>Task</DsTh>
                <DsTh>{state.isVa ? 'Project' : 'Order'}</DsTh>
                <DsTh>Note</DsTh>
              </DsThead>
              <tbody>
                {state.today.map((e) => {
                  const hrs = hoursBetween(new Date(e.started_at), e.ended_at ? new Date(e.ended_at) : null);
                  const tagCell =
                    e.order_id ? `#${e.order_id}`
                    : e.project_id ? (projectById.get(e.project_id)?.name ?? '—')
                    : '—';
                  return (
                    <DsTr key={e.id}>
                      <DsTd className="tabular-nums">{formatZonedTime(new Date(e.started_at))}</DsTd>
                      <DsTd className="tabular-nums text-neutral-400">
                        {e.ended_at ? formatZonedTime(new Date(e.ended_at)) : <span className="text-teal-400">(in progress)</span>}
                      </DsTd>
                      <DsTd className="tabular-nums">{formatDuration(hrs * 60 * 60 * 1000)}</DsTd>
                      <DsTd>
                        <DsStatusPill label={TASK_LABELS[e.task]} color={DS.orange} />
                      </DsTd>
                      <DsTd>{tagCell}</DsTd>
                      <DsTd className="max-w-[240px] truncate text-neutral-400 text-xs">{e.note ?? '—'}</DsTd>
                    </DsTr>
                  );
                })}
              </tbody>
            </DsTable>
          )}
        </div>

        <aside className="space-y-3">
          <SectionLabel accent={DS.teal}>This Week</SectionLabel>
          <DsCard className="p-5" accent={DS.teal}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Total Hours</div>
            <div className="text-3xl font-black text-teal-300 tabular-nums">
              {weekStats?.total.toFixed(2) ?? '0.00'}
            </div>
            <div className="mt-3 space-y-1">
              {TASK_TYPES.map((t) => {
                const h = weekStats?.byTask[t] ?? 0;
                if (h === 0) return null;
                return (
                  <div key={t} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400 font-sans">{TASK_LABELS[t]}</span>
                    <span className="font-mono tabular-nums text-neutral-300">{h.toFixed(2)}h</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500 uppercase tracking-widest font-mono">Rate</span>
                <span className="font-mono tabular-nums text-white">
                  {state.rate != null ? `$${Number(state.rate).toFixed(2)}/hr` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-neutral-500 uppercase tracking-widest font-mono text-xs">Projected gross</span>
                <span className="font-mono tabular-nums text-teal-300 font-bold">
                  {projectedPay != null ? `$${projectedPay.toFixed(2)}` : '—'}
                </span>
              </div>
            </div>
          </DsCard>
        </aside>
      </section>

      {/* Modal: Clock In / Switch Task */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-2xl border"
            style={{ backgroundColor: DS.bg, borderColor: `${DS.teal}55` }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: DS.cardBorder, backgroundColor: `${DS.teal}10` }}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-400" />
                <span className="font-mono text-sm text-white uppercase tracking-widest">
                  {modalMode === 'switch' ? 'Switch Task' : 'Clock In'}
                </span>
              </div>
              <button onClick={() => setModalMode(null)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                  Task type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TASK_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTask(t)}
                      className="text-left text-xs font-mono uppercase tracking-widest px-3 py-2 rounded-lg border transition-all"
                      style={{
                        backgroundColor: task === t ? `${DS.teal}22` : 'transparent',
                        borderColor: task === t ? `${DS.teal}66` : 'rgba(255,255,255,0.08)',
                        color: task === t ? DS.teal : DS.textDim,
                      }}
                    >
                      {TASK_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {TASKS_REQUIRING_ORDER.includes(task) && (
                state.isVa ? (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                      Project
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full text-sm text-white rounded-lg px-3 py-2 border font-mono"
                      style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <option value="">Select a project…</option>
                      {state.projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {state.projects.length === 0 && (
                      <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-widest">
                        No active projects — ask your team lead to add one.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                      Order
                    </label>
                    <select
                      value={orderId}
                      onChange={(e) => setOrderId(e.target.value)}
                      className="w-full text-sm text-white rounded-lg px-3 py-2 border font-mono"
                      style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <option value="">Select an order…</option>
                      {state.orders.map((o) => (
                        <option key={o.order_id} value={o.order_id}>
                          Order #{o.order_id} · {o.status}
                        </option>
                      ))}
                    </select>
                    {state.orders.length === 0 && (
                      <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-widest">
                        No active orders available.
                      </p>
                    )}
                  </div>
                )
              )}

              <DsInput
                label="Note (optional)"
                value={note}
                onChange={setNote}
                placeholder="e.g. found 3 damaged units"
              />

              {modalError && <p className="text-xs text-rose-400 font-sans">{modalError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: DS.cardBorder }}>
              <DsButton variant="ghost" onClick={() => setModalMode(null)}>Cancel</DsButton>
              <DsButton onClick={submitModal} disabled={submitting} accent={DS.teal}>
                {submitting ? 'Saving…' : modalMode === 'switch' ? 'Switch' : 'Start'}
              </DsButton>
            </div>
          </div>
        </div>
      )}

      {/* VA end-of-day report modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="w-full max-w-xl rounded-2xl border"
            style={{ backgroundColor: DS.bg, borderColor: `${DS.teal}55` }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: DS.cardBorder, backgroundColor: `${DS.teal}10` }}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-400" />
                <span className="font-mono text-sm text-white uppercase tracking-widest">
                  Almost done — end-of-day report
                </span>
              </div>
              <button onClick={() => setReportOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {state?.todayReport && (
                <div
                  className="text-[11px] text-neutral-400 font-sans px-3 py-2 rounded-lg border"
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  You already submitted a report today at {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(state.todayReport.submitted_at))}.
                  Anything you add will be appended to it.
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
                  What I accomplished today *
                </label>
                <textarea
                  value={report.accomplishments}
                  onChange={(e) => setReport({ ...report, accomplishments: e.target.value.slice(0, 2000) })}
                  rows={5}
                  placeholder="Minimum 20 characters. Be specific — what shipped?"
                  className="w-full text-sm text-white border rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-[#4ECDC466] placeholder-neutral-600"
                  style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                />
                <div className="text-[10px] text-neutral-500 text-right mt-0.5">
                  {report.accomplishments.length}/2000
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
                  What I&apos;m stuck on (optional)
                </label>
                <textarea
                  value={report.stuck_on}
                  onChange={(e) => setReport({ ...report, stuck_on: e.target.value.slice(0, 1000) })}
                  rows={2}
                  placeholder="Blockers, open questions, anything the team can help with"
                  className="w-full text-sm text-white border rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-[#4ECDC466] placeholder-neutral-600"
                  style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
                  What I&apos;m working on tomorrow (optional)
                </label>
                <textarea
                  value={report.tomorrow_plan}
                  onChange={(e) => setReport({ ...report, tomorrow_plan: e.target.value.slice(0, 1000) })}
                  rows={2}
                  placeholder="Top 1-3 priorities for tomorrow"
                  className="w-full text-sm text-white border rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-[#4ECDC466] placeholder-neutral-600"
                  style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                />
              </div>

              {reportError && <p className="text-xs text-rose-400 font-sans">{reportError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: DS.cardBorder }}>
              <DsButton variant="ghost" onClick={() => setReportOpen(false)}>
                Keep me clocked in
              </DsButton>
              <DsButton onClick={submitVaClockOut} disabled={submittingReport} accent={DS.teal}>
                {submittingReport ? 'Submitting…' : 'Submit and Clock Out'}
              </DsButton>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl border text-sm font-mono"
             style={{ backgroundColor: 'rgba(10,10,15,0.95)', borderColor: `${DS.teal}66`, color: DS.teal, boxShadow: `0 0 24px ${DS.teal}44` }}>
          {confirmation}
        </div>
      )}
    </PageShell>
  );
}
