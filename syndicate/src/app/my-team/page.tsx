'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS, PageShell, PageHeader, DsCard, DsButton, DsInput, SectionLabel, DsStatusPill,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsEmpty, DsCountPill,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  VA_PROFILE_LABELS, VA_PROFILE_DESCRIPTIONS, type VaProfile,
} from '@/lib/permissions';
import {
  UserPlus, RefreshCw, Copy, Shield, Power, CircleDollarSign, Archive, ArchiveRestore, Plus, X, Users2, Clock, ClipboardList, Package as PackageIcon, FileText, Activity, Download, ChevronDown, ChevronRight, AlertCircle,
} from 'lucide-react';
import {
  TASK_LABELS, TASK_TYPES, type TaskType as TaskTypeKey, hoursBetween, formatDuration, formatZonedTime, payPeriodStart, payPeriodEnd,
} from '@/lib/timeTracking';

type Tab = 'vas' | 'live' | 'hours' | 'by-project' | 'reports';

interface TeamState {
  team: { id: string; name: string; owner_id: string; is_warehouse: boolean };
  isAdminImpersonating: boolean;
  caller: { user_id: string; email: string; role: string };
  vas: Array<{
    id: string; user_id: string; email: string | null;
    first_name: string; last_name: string;
    active: boolean; start_date: string;
    va_profile: VaProfile | null;
    rate: number | null; hours_this_week: number;
  }>;
  projects: Array<{
    id: string; name: string; description: string | null;
    active: boolean; created_at: string; archived_at: string | null;
  }>;
}

function randomPassword(len = 12): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = new Uint32Array(len);
    crypto.getRandomValues(b);
    return Array.from(b, (n) => a[n % a.length]).join('');
  }
  let o = '';
  for (let i = 0; i < len; i++) o += a[Math.floor(Math.random() * a.length)];
  return o;
}

export default function MyTeamPage() {
  return <MyTeamPortal />;
}

// Shared portal used by /my-team and /admin/teams/[teamId] (Phase 6 wires
// the admin route to this with ?teamId=... in the URL).
export function MyTeamPortal({ teamId: explicitTeamId }: { teamId?: string } = {}) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const teamId = explicitTeamId ?? search.get('teamId') ?? undefined;

  const [state, setState] = useState<TeamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('vas');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
    if (!authLoading && user) {
      const allowed = user.role === 'admin' || user.is_one_on_one_student;
      if (!allowed) router.push('/dashboard');
    }
  }, [authLoading, isAuthenticated, user, router]);

  const load = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
      const res = await fetch(`/api/my-team/state${qs}`, { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setState(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;
  if (error || !state) {
    return (
      <PageShell>
        <PageHeader label="Team" title="Error" accent={DS.red} />
        <DsCard className="p-5" accent={DS.red}>
          <p className="text-sm text-rose-400 font-sans">{error ?? 'Team not found.'}</p>
          <DsButton variant="ghost" onClick={load} className="mt-3">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </DsButton>
        </DsCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        label={state.isAdminImpersonating ? `Admin · Viewing ${state.team.name}` : 'My Team'}
        title={state.team.name}
        subtitle={state.isAdminImpersonating
          ? 'You are viewing a student\'s team on their behalf. Every action is attributed to you in the audit log.'
          : `${state.vas.filter((v) => v.active).length} active VA${state.vas.filter((v) => v.active).length === 1 ? '' : 's'} · ${state.projects.filter((p) => p.active).length} active projects`}
        accent={DS.teal}
        right={
          <DsButton variant="ghost" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </DsButton>
        }
      />

      {state.isAdminImpersonating && (
        <DsCard className="p-3" accent={DS.orange}>
          <p className="text-xs text-neutral-300 font-sans">
            Viewing on behalf of the team owner. Every modification is attributed to your admin account.
          </p>
        </DsCard>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: 'vas',        label: 'VAs',            icon: Users2 },
          { id: 'live',       label: 'Live Status',    icon: Activity },
          { id: 'hours',      label: 'Hours Report',   icon: ClipboardList },
          { id: 'by-project', label: 'Hours by Project', icon: PackageIcon },
          { id: 'reports',    label: 'Daily Reports',  icon: FileText },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest font-mono border"
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

      {tab === 'vas'        && <VAsTab state={state} onChange={load} />}
      {tab === 'live'       && <LiveStatusTab teamId={state.team.id} />}
      {tab === 'hours'      && <HoursReportTab teamId={state.team.id} />}
      {tab === 'by-project' && <HoursByProjectTab teamId={state.team.id} />}
      {tab === 'reports'    && <DailyReportsTab teamId={state.team.id} vas={state.vas} />}
    </PageShell>
  );
}

// ─── VAs tab ───────────────────────────────────────────────────────────────

function VAsTab({ state, onChange }: { state: TeamState; onChange: () => void }) {
  const teamId = state.team.id;
  const activeVas = useMemo(() => state.vas.filter((v) => v.active), [state.vas]);
  const inactiveVas = useMemo(() => state.vas.filter((v) => !v.active), [state.vas]);

  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    profile: 'research' as VaProfile,
    hourlyRate: '', startDate: new Date().toISOString().slice(0, 10),
    tempPassword: randomPassword(),
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [addingProject, setAddingProject] = useState(false);

  const submitCreate = async () => {
    setCreateError(null);
    const rate = Number(form.hourlyRate);
    if (!form.firstName.trim() || !form.lastName.trim()) { setCreateError('Name required'); return; }
    if (!Number.isFinite(rate) || rate < 0) { setCreateError('Valid hourly rate required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/my-team/vas/create?teamId=${encodeURIComponent(teamId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          profile: form.profile,
          hourlyRate: rate,
          startDate: form.startDate,
          tempPassword: form.tempPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error ?? 'Failed'); return; }
      setCreated({ email: json.data.email, tempPassword: json.data.tempPassword });
      setShowCreate(false);
      setForm({
        firstName: '', lastName: '', email: '',
        profile: 'research',
        hourlyRate: '', startDate: new Date().toISOString().slice(0, 10),
        tempPassword: randomPassword(),
      });
      onChange();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (vaId: string, active: boolean) => {
    setActingOn(vaId);
    try {
      await fetch(`/api/my-team/vas/${vaId}?teamId=${encodeURIComponent(teamId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });
      onChange();
    } finally { setActingOn(null); }
  };

  const changeProfile = async (vaId: string) => {
    const p = window.prompt(
      'New profile? (research / operations / customer_service / full_access)',
    );
    if (!p) return;
    if (!['research', 'operations', 'customer_service', 'full_access'].includes(p)) {
      window.alert('Not a valid profile');
      return;
    }
    setActingOn(vaId);
    try {
      await fetch(`/api/my-team/vas/${vaId}?teamId=${encodeURIComponent(teamId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: p }),
      });
      onChange();
    } finally { setActingOn(null); }
  };

  const changeRate = async (vaId: string) => {
    const raw = window.prompt('New hourly rate (USD):');
    if (!raw) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) { window.alert('Enter a non-negative number'); return; }
    setActingOn(vaId);
    try {
      await fetch(`/api/my-team/vas/${vaId}?teamId=${encodeURIComponent(teamId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourlyRate: n }),
      });
      onChange();
    } finally { setActingOn(null); }
  };

  const addProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setAddingProject(true);
    try {
      const res = await fetch(`/api/my-team/projects?teamId=${encodeURIComponent(teamId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: newProjectDesc.trim() || null }),
      });
      if (res.ok) {
        setNewProjectName('');
        setNewProjectDesc('');
        onChange();
      }
    } finally { setAddingProject(false); }
  };

  const toggleProject = async (projectId: string, active: boolean) => {
    await fetch(`/api/my-team/projects/${projectId}?teamId=${encodeURIComponent(teamId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    });
    onChange();
  };

  return (
    <section className="space-y-5">
      {created && (
        <DsCard className="p-5" accent={DS.red}>
          <div className="flex items-start gap-3 mb-3">
            <Shield className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-mono uppercase tracking-widest text-rose-400 mb-1">Write these down now</p>
              <p className="text-xs text-neutral-300 font-sans">
                This is the only time you&apos;ll see this password. Supabase stores only a hashed copy.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <CredentialRow label="Email" value={created.email} />
            <CredentialRow label="Password" value={created.tempPassword} mono />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <DsButton
              accent={DS.teal}
              onClick={() => navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.tempPassword}`)}
            >
              <Copy className="w-3.5 h-3.5" /> Copy both
            </DsButton>
            <DsButton variant="ghost" onClick={() => setCreated(null)}>Dismiss</DsButton>
          </div>
        </DsCard>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionLabel accent={DS.teal}>VAs <DsCountPill count={activeVas.length} accent={DS.teal} /></SectionLabel>
        <DsButton accent={DS.teal} onClick={() => setShowCreate(true)}>
          <UserPlus className="w-3.5 h-3.5" /> Add VA
        </DsButton>
      </div>

      {activeVas.length === 0 ? (
        <DsEmpty icon={<Users2 className="w-6 h-6" />} title="No VAs yet" body="Add your first VA above to get started." />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>Name</DsTh>
            <DsTh>Email</DsTh>
            <DsTh>Profile</DsTh>
            <DsTh className="text-right">Rate</DsTh>
            <DsTh className="text-right">Hours (wk)</DsTh>
            <DsTh className="text-right">Actions</DsTh>
          </DsThead>
          <tbody>
            {activeVas.map((v) => (
              <DsTr key={v.id}>
                <DsTd className="font-semibold text-white">{v.first_name} {v.last_name}</DsTd>
                <DsTd className="text-neutral-400">{v.email ?? '—'}</DsTd>
                <DsTd>
                  <DsStatusPill
                    label={v.va_profile ? VA_PROFILE_LABELS[v.va_profile] : '—'}
                    color={DS.orange}
                  />
                </DsTd>
                <DsTd className="text-right tabular-nums">{v.rate != null ? `$${Number(v.rate).toFixed(2)}` : '—'}</DsTd>
                <DsTd className="text-right tabular-nums">{v.hours_this_week.toFixed(2)}</DsTd>
                <DsTd className="text-right">
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    <DsButton variant="ghost" onClick={() => changeProfile(v.id)} disabled={actingOn === v.id}>
                      <Shield className="w-3.5 h-3.5" /> Profile
                    </DsButton>
                    <DsButton variant="ghost" onClick={() => changeRate(v.id)} disabled={actingOn === v.id}>
                      <CircleDollarSign className="w-3.5 h-3.5" /> Rate
                    </DsButton>
                    <DsButton variant="danger" onClick={() => toggleActive(v.id, v.active)} disabled={actingOn === v.id}>
                      <Power className="w-3.5 h-3.5" /> Deactivate
                    </DsButton>
                  </div>
                </DsTd>
              </DsTr>
            ))}
          </tbody>
        </DsTable>
      )}

      {inactiveVas.length > 0 && (
        <details>
          <summary className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 cursor-pointer mt-3">
            Inactive ({inactiveVas.length})
          </summary>
          <DsTable className="mt-2">
            <DsThead>
              <DsTh>Name</DsTh>
              <DsTh>Email</DsTh>
              <DsTh>Profile</DsTh>
              <DsTh className="text-right">Actions</DsTh>
            </DsThead>
            <tbody>
              {inactiveVas.map((v) => (
                <DsTr key={v.id}>
                  <DsTd className="text-neutral-400">{v.first_name} {v.last_name}</DsTd>
                  <DsTd className="text-neutral-500 text-xs">{v.email ?? '—'}</DsTd>
                  <DsTd className="text-neutral-500 text-xs uppercase">
                    {v.va_profile ? VA_PROFILE_LABELS[v.va_profile] : '—'}
                  </DsTd>
                  <DsTd className="text-right">
                    <DsButton variant="secondary" accent={DS.teal} onClick={() => toggleActive(v.id, v.active)} disabled={actingOn === v.id}>
                      Reactivate
                    </DsButton>
                  </DsTd>
                </DsTr>
              ))}
            </tbody>
          </DsTable>
        </details>
      )}

      {/* Projects panel */}
      <div className="mt-8">
        <SectionLabel accent={DS.orange}>Projects</SectionLabel>
        <DsCard className="p-4" accent={DS.orange}>
          <div className="flex items-end gap-3 flex-wrap">
            <DsInput
              label="New project"
              value={newProjectName}
              onChange={setNewProjectName}
              placeholder="e.g. Brand A — Q1 PPC"
              className="flex-1 min-w-[220px]"
            />
            <DsInput
              label="Description (optional)"
              value={newProjectDesc}
              onChange={setNewProjectDesc}
              placeholder="Short context for VAs"
              className="flex-1 min-w-[220px]"
            />
            <DsButton
              onClick={addProject}
              disabled={addingProject || !newProjectName.trim()}
              accent={DS.orange}
            >
              <Plus className="w-3.5 h-3.5" /> Add Project
            </DsButton>
          </div>
        </DsCard>

        {state.projects.length === 0 ? (
          <DsEmpty
            icon={<PackageIcon className="w-6 h-6" />}
            title="No projects yet"
            body="Projects let VAs tag their time to specific client work. Add your first one above."
          />
        ) : (
          <DsTable className="mt-3">
            <DsThead>
              <DsTh>Project</DsTh>
              <DsTh>Description</DsTh>
              <DsTh>Status</DsTh>
              <DsTh className="text-right">Actions</DsTh>
            </DsThead>
            <tbody>
              {state.projects.map((p) => (
                <DsTr key={p.id}>
                  <DsTd className="font-semibold text-white">{p.name}</DsTd>
                  <DsTd className="text-neutral-400 text-xs max-w-[300px] truncate">{p.description ?? '—'}</DsTd>
                  <DsTd>
                    <DsStatusPill label={p.active ? 'Active' : 'Archived'} color={p.active ? DS.teal : DS.muted} />
                  </DsTd>
                  <DsTd className="text-right">
                    <DsButton
                      variant="ghost"
                      onClick={() => toggleProject(p.id, p.active)}
                    >
                      {p.active ? (
                        <><Archive className="w-3.5 h-3.5" /> Archive</>
                      ) : (
                        <><ArchiveRestore className="w-3.5 h-3.5" /> Restore</>
                      )}
                    </DsButton>
                  </DsTd>
                </DsTr>
              ))}
            </tbody>
          </DsTable>
        )}
      </div>

      {/* Create VA modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <DsCard className="p-5 w-full max-w-xl" accent={DS.teal}>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel accent={DS.teal}>Create VA</SectionLabel>
              <button onClick={() => setShowCreate(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DsInput label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
              <DsInput label="Last name"  value={form.lastName}  onChange={(v) => setForm({ ...form, lastName: v })} />
              <DsInput label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} className="md:col-span-2" />
              <DsInput label="Hourly rate" value={form.hourlyRate} onChange={(v) => setForm({ ...form, hourlyRate: v })} type="number" placeholder="18.50" />
              <DsInput label="Start date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} type="date" />
            </div>

            <div className="mt-3">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Profile</label>
              <div className="grid grid-cols-1 gap-2">
                {(['research', 'operations', 'customer_service', 'full_access'] as VaProfile[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, profile: p })}
                    className="text-left rounded-lg border p-3 transition-all"
                    style={{
                      backgroundColor: form.profile === p ? `${DS.teal}22` : 'transparent',
                      borderColor: form.profile === p ? `${DS.teal}66` : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="font-mono text-xs uppercase tracking-widest text-white">{VA_PROFILE_LABELS[p]}</div>
                    <div className="text-[10px] text-neutral-500 mt-1 font-sans leading-relaxed">{VA_PROFILE_DESCRIPTIONS[p]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-end gap-3">
                <DsInput
                  label="Temporary password"
                  value={form.tempPassword}
                  onChange={(v) => setForm({ ...form, tempPassword: v })}
                  className="flex-1"
                />
                <DsButton variant="ghost" onClick={() => setForm({ ...form, tempPassword: randomPassword() })}>
                  <RefreshCw className="w-3.5 h-3.5" /> Generate
                </DsButton>
              </div>
            </div>

            {createError && <p className="text-xs text-rose-400 mt-2">{createError}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <DsButton variant="ghost" onClick={() => setShowCreate(false)}>Cancel</DsButton>
              <DsButton onClick={submitCreate} disabled={submitting} accent={DS.teal}>
                <UserPlus className="w-3.5 h-3.5" />
                {submitting ? 'Creating…' : 'Create VA'}
              </DsButton>
            </div>
          </DsCard>
        </div>
      )}
    </section>
  );
}

function CredentialRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 w-20 shrink-0">{label}</span>
      <code className={`flex-1 text-sm text-white bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 ${mono ? 'tracking-wider' : ''}`}>
        {value}
      </code>
      <DsButton variant="ghost" onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}>
        <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
      </DsButton>
    </div>
  );
}

function toBusinessDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

// ─── Live Status ───────────────────────────────────────────────────────────

function LiveStatusTab({ teamId }: { teamId: string }) {
  const [data, setData] = useState<{
    live: Array<{ employee_id: string; first_name: string; last_name: string; started_at: string; task: string; order_id: number | null; project_name: string | null; needs_report: boolean }>;
    needs_report: Array<{ employee_id: string; first_name: string; last_name: string; started_at: string; task: string; order_id: number | null; project_name: string | null; needs_report: boolean }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/my-team/live-status?teamId=${encodeURIComponent(teamId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const a = setInterval(() => load(), 30000);
    const b = setInterval(() => setTick((n) => n + 1), 15000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  if (loading) return <PageLoadingSpinner />;
  if (error) return <ErrorCard message={error} onRetry={load} />;

  const all = [...(data?.needs_report ?? []), ...(data?.live ?? [])];
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel accent={DS.teal}>Currently Clocked In · {all.length}</SectionLabel>
        <DsButton variant="ghost" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </DsButton>
      </div>
      {all.length === 0 ? (
        <DsEmpty icon={<Activity className="w-6 h-6" />} title="No-one clocked in right now" body="VAs show here live when they clock in." />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>VA</DsTh>
            <DsTh>Task</DsTh>
            <DsTh>Project / Order</DsTh>
            <DsTh>Started</DsTh>
            <DsTh className="text-right">Duration</DsTh>
            <DsTh>Status</DsTh>
          </DsThead>
          <tbody>
            {all.map((r) => {
              const start = new Date(r.started_at);
              const hrs = hoursBetween(start, null);
              return (
                <DsTr key={r.employee_id}>
                  <DsTd className="font-semibold text-white">{r.first_name} {r.last_name}</DsTd>
                  <DsTd><DsStatusPill label={TASK_LABELS[r.task as TaskTypeKey] ?? r.task} color={DS.orange} /></DsTd>
                  <DsTd>{r.project_name ?? (r.order_id ? `Order #${r.order_id}` : '—')}</DsTd>
                  <DsTd className="tabular-nums text-neutral-400">{formatZonedTime(start)}</DsTd>
                  <DsTd className="text-right tabular-nums font-mono text-teal-300">{formatDuration(hrs * 3600000)}</DsTd>
                  <DsTd>
                    {r.needs_report
                      ? <DsStatusPill label="Needs EOD Report" color={DS.red} />
                      : <DsStatusPill label="Live" color={DS.teal} />}
                  </DsTd>
                </DsTr>
              );
            })}
          </tbody>
        </DsTable>
      )}
    </section>
  );
}

// ─── Hours Report ──────────────────────────────────────────────────────────

function HoursReportTab({ teamId }: { teamId: string }) {
  const [from, setFrom] = useState(toBusinessDateInput(payPeriodStart()));
  const [to, setTo] = useState(toBusinessDateInput(new Date(payPeriodEnd().getTime())));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    rows: Array<{
      employee_id: string; first_name: string; last_name: string; email: string; active: boolean;
      total_hours: number; by_task: Record<TaskTypeKey, number>; hourly_rate: number; gross_pay: number;
      unresolved_entries: number;
    }>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/my-team/hours-report?teamId=${encodeURIComponent(teamId)}&from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setReport(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setLoading(false); }
  }, [teamId, from, to]);
  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    window.open(`/api/my-team/payroll-export?teamId=${encodeURIComponent(teamId)}&from=${from}&to=${to}`, '_blank');
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
          <DsEmpty icon={<ClipboardList className="w-6 h-6" />} title="No hours logged" body="No time entries in this range." />
        ) : (
          <div className="overflow-x-auto">
            <DsTable>
              <DsThead>
                <DsTh>VA</DsTh>
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

// ─── Hours by Project ──────────────────────────────────────────────────────

function HoursByProjectTab({ teamId }: { teamId: string }) {
  const [from, setFrom] = useState(toBusinessDateInput(payPeriodStart()));
  const [to, setTo] = useState(toBusinessDateInput(new Date(payPeriodEnd().getTime())));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{
    project_id: string; name: string; total_hours: number;
    per_employee: Array<{ employee_id: string; name: string; total: number; byTask: Record<string, number> }>;
  }> | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/my-team/hours-by-project?teamId=${encodeURIComponent(teamId)}&from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setRows(json.data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setLoading(false); }
  }, [teamId, from, to]);
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
          <DsEmpty icon={<PackageIcon className="w-6 h-6" />} title="No labor hours by project" body="No entries tagged to a project in this range." />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <DsCard key={r.project_id} className="p-4">
                <button
                  onClick={() => setExpanded((x) => ({ ...x, [r.project_id]: !x[r.project_id] }))}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="flex items-center gap-2">
                    {expanded[r.project_id] ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />}
                    <span className="font-mono uppercase tracking-widest text-sm font-bold text-white">{r.name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-teal-300">{r.total_hours.toFixed(2)} h</span>
                </button>
                {expanded[r.project_id] && (
                  <div className="mt-3 pl-3 border-l border-white/[0.08] space-y-2">
                    {r.per_employee.map((pe) => (
                      <div key={pe.employee_id} className="flex items-center justify-between gap-3 text-xs flex-wrap">
                        <span className="text-white font-sans">{pe.name}</span>
                        <div className="flex items-center gap-3 flex-wrap">
                          {Object.entries(pe.byTask).map(([t, h]) => (
                            <span key={t} className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                              {TASK_LABELS[t as TaskTypeKey] ?? t}: {(h as number).toFixed(2)}
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

// ─── Daily Reports ─────────────────────────────────────────────────────────

function DailyReportsTab({ teamId, vas }: { teamId: string; vas: TeamState['vas'] }) {
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toBusinessDateInput(d);
  }, []);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(toBusinessDateInput(new Date()));
  const [employeeId, setEmployeeId] = useState<string>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Array<{
    id: string; employee_id: string; employee_name: string; report_date: string;
    accomplishments: string; stuck_on: string | null; tomorrow_plan: string | null;
    submitted_at: string; edited_at: string | null;
  }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ teamId, from, to });
      if (employeeId) params.set('employeeId', employeeId);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/my-team/daily-reports?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setRows(json.data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setLoading(false); }
  }, [teamId, from, to, employeeId, q]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="space-y-3">
      <DsCard className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">VA</span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full text-sm text-white rounded-lg px-3 py-2 border font-mono"
              style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <option value="">All VAs</option>
              {vas.map((v) => (
                <option key={v.id} value={v.id}>{v.first_name} {v.last_name}</option>
              ))}
            </select>
          </label>
          <DsInput label="From" type="date" value={from} onChange={setFrom} />
          <DsInput label="To"   type="date" value={to}   onChange={setTo} />
          <DsInput label="Search" value={q} onChange={setQ} placeholder="e.g. damaged units" />
          <DsButton onClick={load} variant="secondary" accent={DS.teal}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </DsButton>
        </div>
      </DsCard>

      {loading && <PageLoadingSpinner />}
      {error && <ErrorCard message={error} onRetry={load} />}
      {rows && !loading && !error && (
        rows.length === 0 ? (
          <DsEmpty icon={<FileText className="w-6 h-6" />} title="No reports found" body="Try widening the date range or clearing the search." />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const expand = !!expanded[r.id];
              const preview = r.accomplishments.slice(0, 120) + (r.accomplishments.length > 120 ? '…' : '');
              return (
                <DsCard key={r.id} className="p-4">
                  <button
                    onClick={() => setExpanded((x) => ({ ...x, [r.id]: !x[r.id] }))}
                    className="flex items-start justify-between w-full text-left gap-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {expand ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />}
                        <span className="font-mono uppercase tracking-widest text-sm font-bold text-white">{r.employee_name}</span>
                        <span className="text-[10px] text-neutral-500 font-mono uppercase">{r.report_date}</span>
                        {r.edited_at && <span className="text-[10px] text-yellow-400 font-mono uppercase">edited</span>}
                      </div>
                      {!expand && <p className="text-xs text-neutral-400 font-sans mt-1.5 pl-5">{preview}</p>}
                    </div>
                    <span className="text-[10px] text-neutral-500 font-mono uppercase whitespace-nowrap">
                      {formatZonedTime(new Date(r.submitted_at))}
                    </span>
                  </button>
                  {expand && (
                    <div className="mt-3 pl-5 space-y-3 text-xs text-neutral-300 font-sans">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-teal-400 mb-0.5">Accomplished</div>
                        <pre className="whitespace-pre-wrap font-sans leading-relaxed">{r.accomplishments}</pre>
                      </div>
                      {r.stuck_on && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-0.5">Stuck on</div>
                          <pre className="whitespace-pre-wrap font-sans leading-relaxed">{r.stuck_on}</pre>
                        </div>
                      )}
                      {r.tomorrow_plan && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-0.5">Tomorrow</div>
                          <pre className="whitespace-pre-wrap font-sans leading-relaxed">{r.tomorrow_plan}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </DsCard>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <DsCard className="p-5" accent={DS.red}>
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <p className="text-sm text-rose-400 font-sans">{message}</p>
      </div>
      <DsButton variant="ghost" onClick={onRetry} className="mt-3">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </DsButton>
    </DsCard>
  );
}
