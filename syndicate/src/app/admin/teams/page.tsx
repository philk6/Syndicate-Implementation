'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS, PageShell, PageHeader, DsCard, DsButton, MetricCard, SectionLabel, DsStatusPill,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsEmpty,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Users2, ClipboardList, Package as PackageIcon, ArrowRight, RefreshCw, Clock,
} from 'lucide-react';

interface Overview {
  pay_period_start: string;
  pay_period_end: string;
  platform_hours_this_period: number;
  total_active_vas: number;
  total_active_employees: number;
  total_teams: number;
  teams: Array<{
    team_id: string; name: string; owner_name: string; owner_email: string; is_warehouse: boolean;
    active_staff: number; active_vas: number; active_employees: number; hours_this_week: number;
  }>;
  top_projects: Array<{ project_id: string; name: string; hours: number }>;
  top_orders: Array<{ order_id: number; hours: number }>;
}

export default function AdminTeamsPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
    if (!authLoading && user && user.role !== 'admin') router.push('/dashboard');
  }, [authLoading, isAuthenticated, user, router]);

  const load = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('/api/admin/teams/overview', { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated || user?.role !== 'admin') return null;
  if (error || !data) {
    return (
      <PageShell>
        <PageHeader label="Admin" title="Teams" accent={DS.red} />
        <DsCard className="p-5" accent={DS.red}>
          <p className="text-sm text-rose-400 font-sans">{error ?? 'Failed to load'}</p>
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
        label="Admin"
        title="Teams"
        subtitle={`${data.total_teams} team${data.total_teams === 1 ? '' : 's'} · Pay period ${new Date(data.pay_period_start).toLocaleDateString()} → ${new Date(new Date(data.pay_period_end).getTime() - 1).toLocaleDateString()}`}
        accent={DS.teal}
        right={
          <DsButton variant="ghost" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </DsButton>
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Platform Hours (period)" value={data.platform_hours_this_period.toFixed(1)} accent={DS.teal} icon={<Clock className="w-4 h-4" />} />
        <MetricCard label="Active VAs" value={data.total_active_vas} accent={DS.orange} icon={<Users2 className="w-4 h-4" />} />
        <MetricCard label="Active Employees" value={data.total_active_employees} accent={DS.yellow} icon={<Users2 className="w-4 h-4" />} />
        <MetricCard label="Teams" value={data.total_teams} accent={DS.blue} icon={<Users2 className="w-4 h-4" />} />
      </section>

      <section>
        <SectionLabel accent={DS.teal}>All Teams</SectionLabel>
        {data.teams.length === 0 ? (
          <DsEmpty icon={<Users2 className="w-6 h-6" />} title="No teams" body="Mark a user as a one-on-one student to create their team." />
        ) : (
          <DsTable>
            <DsThead>
              <DsTh>Team</DsTh>
              <DsTh>Owner</DsTh>
              <DsTh className="text-right">VAs</DsTh>
              <DsTh className="text-right">Employees</DsTh>
              <DsTh className="text-right">Hours (week)</DsTh>
              <DsTh>Kind</DsTh>
              <DsTh className="text-right">{''}</DsTh>
            </DsThead>
            <tbody>
              {data.teams.map((t) => (
                <DsTr key={t.team_id} onClick={() => router.push(`/admin/teams/${t.team_id}`)}>
                  <DsTd className="font-semibold text-white">{t.name}</DsTd>
                  <DsTd className="text-neutral-300 text-xs">
                    {t.owner_name}<span className="text-neutral-500"> · {t.owner_email}</span>
                  </DsTd>
                  <DsTd className="text-right tabular-nums">{t.active_vas}</DsTd>
                  <DsTd className="text-right tabular-nums">{t.active_employees}</DsTd>
                  <DsTd className="text-right tabular-nums font-mono text-teal-300">{t.hours_this_week.toFixed(2)}</DsTd>
                  <DsTd>
                    <DsStatusPill
                      label={t.is_warehouse ? 'Warehouse' : 'One-on-One'}
                      color={t.is_warehouse ? DS.orange : DS.teal}
                    />
                  </DsTd>
                  <DsTd className="text-right">
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-500 inline" />
                  </DsTd>
                </DsTr>
              ))}
            </tbody>
          </DsTable>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <SectionLabel accent={DS.orange}>Top 5 Projects</SectionLabel>
          {data.top_projects.length === 0 ? (
            <DsEmpty icon={<PackageIcon className="w-6 h-6" />} title="No project hours" body="VA time tagged to projects will rank here." />
          ) : (
            <DsTable>
              <DsThead><DsTh>Project</DsTh><DsTh className="text-right">Hours</DsTh></DsThead>
              <tbody>
                {data.top_projects.map((p) => (
                  <DsTr key={p.project_id}>
                    <DsTd className="text-white">{p.name}</DsTd>
                    <DsTd className="text-right tabular-nums font-mono">{p.hours.toFixed(2)}</DsTd>
                  </DsTr>
                ))}
              </tbody>
            </DsTable>
          )}
        </div>
        <div>
          <SectionLabel accent={DS.blue}>Top 5 Orders</SectionLabel>
          {data.top_orders.length === 0 ? (
            <DsEmpty icon={<ClipboardList className="w-6 h-6" />} title="No order hours" body="Warehouse time tagged to orders will rank here." />
          ) : (
            <DsTable>
              <DsThead><DsTh>Order</DsTh><DsTh className="text-right">Hours</DsTh></DsThead>
              <tbody>
                {data.top_orders.map((o) => (
                  <DsTr key={o.order_id}>
                    <DsTd className="text-white">
                      <Link href={`/admin/orders/${o.order_id}`} className="hover:text-[#FF6B35]">
                        Order #{o.order_id}
                      </Link>
                    </DsTd>
                    <DsTd className="text-right tabular-nums font-mono">{o.hours.toFixed(2)}</DsTd>
                  </DsTr>
                ))}
              </tbody>
            </DsTable>
          )}
        </div>
      </section>
    </PageShell>
  );
}
