'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS,
  PageShell,
  PageHeader,
  SectionLabel,
  MetricCard,
  DsButton,
  DsEmpty,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { Package, Target, AlertTriangle, Clock, Plus } from 'lucide-react';

interface DashboardStats {
  totalSuppliers: number;
  strongCandidates: number;
  highRiskCount: number;
  needsActionQueue: number;
}

export default function SupplierIntelDashboardPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancel = false;
    (async () => {
      try {
        const res = await fetch('/api/supplier-intel/dashboard');
        const json = await res.json();
        if (!cancel && res.ok) setStats(json.data);
      } catch (err) {
        console.error('Dashboard fetch failed:', err);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [isAuthenticated]);

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel"
        title="Dashboard"
        subtitle="Mission control for supplier outreach."
        accent={DS.orange}
        right={
          <Link href="/supplier-intel/lists">
            <DsButton variant="primary" accent={DS.orange}>
              <Plus className="w-3.5 h-3.5" /> Manage Lists
            </DsButton>
          </Link>
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Suppliers"
          value={stats?.totalSuppliers ?? 0}
          accent={DS.orange}
          icon={<Package className="w-4 h-4" />}
        />
        <MetricCard
          label="Strong Candidates"
          value={stats?.strongCandidates ?? 0}
          accent={DS.teal}
          icon={<Target className="w-4 h-4" />}
        />
        <MetricCard
          label="High Risk"
          value={stats?.highRiskCount ?? 0}
          accent={DS.red}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <MetricCard
          label="Needs Action"
          value={stats?.needsActionQueue ?? 0}
          accent={DS.yellow}
          icon={<Clock className="w-4 h-4" />}
        />
      </section>

      <section>
        <SectionLabel accent={DS.orange}>Quick Actions</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/supplier-intel/lists"
            className="block rounded-2xl border p-5 transition-colors hover:bg-white/[0.02]"
            style={{ borderColor: `${DS.orange}33`, backgroundColor: DS.cardBg }}
          >
            <h3 className="font-mono uppercase tracking-widest text-sm font-bold text-white mb-1">
              Supplier Lists
            </h3>
            <p className="text-xs text-neutral-400">
              Create lists, add suppliers manually or via CSV, and track their workflow.
            </p>
          </Link>
          <DsEmpty
            icon={<Target className="w-6 h-6" />}
            title="Discovery & Analysis"
            body="Wholesale supplier discovery + AI-powered vetting arrive in the next port phase."
          />
        </div>
      </section>
    </PageShell>
  );
}
