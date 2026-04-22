'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS,
  PageShell,
  PageHeader,
  DsCard,
  DsButton,
  MetricCard,
  SectionLabel,
  DsEmpty,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { Shield, RefreshCw, Users, Database, AlertTriangle, ArrowLeft } from 'lucide-react';

export default function SupplierIntelAdminPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rescoring, setRescoring] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'admin') {
      router.push('/supplier-intel/dashboard');
    }
  }, [authLoading, user, router]);

  if (authLoading) return <PageLoadingSpinner />;
  if (!isAuthenticated || user?.role !== 'admin') return null;

  const rescore = async () => {
    setRescoring(true);
    setResult(null);
    try {
      const res = await fetch('/api/supplier-intel/admin/rescore', { method: 'POST' });
      const json = await res.json();
      if (res.ok) setResult(json.data.message);
      else setResult(json.error ?? 'Rescore failed');
    } finally {
      setRescoring(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel · Admin"
        title="Operations Control"
        subtitle="Admin-only controls for the Supplier Intel pipeline."
        accent={DS.red}
        right={
          <Link href="/supplier-intel/dashboard">
            <DsButton variant="ghost">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </DsButton>
          </Link>
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Active Workers" value={1} accent={DS.teal} icon={<Database className="w-4 h-4" />} sub="analyze + discovery" />
        <MetricCard label="Queue Depth" value={0} accent={DS.yellow} icon={<RefreshCw className="w-4 h-4" />} sub="jobs pending" />
        <MetricCard label="Analyses (30d)" value="—" accent={DS.orange} icon={<Shield className="w-4 h-4" />} sub="live counter wiring soon" />
        <MetricCard label="Active Users" value="—" accent={DS.blue} icon={<Users className="w-4 h-4" />} sub="live counter wiring soon" />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DsCard className="p-5" accent={DS.red}>
          <SectionLabel accent={DS.red}>Rescore All Analyses</SectionLabel>
          <p className="text-xs text-neutral-400 font-sans mb-3">
            Re-runs the analyzer on every DONE supplier. Useful after shipping a scoring-weight change.
            In this build the endpoint is stubbed — wiring arrives once the live Claude analyzer is ported.
          </p>
          <DsButton onClick={rescore} disabled={rescoring} variant="danger">
            <RefreshCw className={`w-3.5 h-3.5 ${rescoring ? 'animate-spin' : ''}`} />
            {rescoring ? 'Rescoring…' : 'Run Rescore'}
          </DsButton>
          {result && (
            <div
              className="mt-3 text-xs px-3 py-2 rounded-lg border"
              style={{
                color: DS.textDim,
                backgroundColor: 'rgba(255,255,255,0.02)',
                borderColor: DS.cardBorder,
              }}
            >
              {result}
            </div>
          )}
        </DsCard>

        <DsCard className="p-5" accent={DS.yellow}>
          <SectionLabel accent={DS.yellow}>Pipeline Health</SectionLabel>
          <ul className="space-y-2 text-xs text-neutral-300 font-sans">
            <li className="flex items-center justify-between">
              <span>Scraper latency (p50)</span>
              <span className="font-mono tabular-nums text-neutral-400">—</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Claude analyzer (p50)</span>
              <span className="font-mono tabular-nums text-neutral-400">—</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Discovery candidates / search (avg)</span>
              <span className="font-mono tabular-nums text-neutral-400">—</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Failed jobs (24h)</span>
              <span className="font-mono tabular-nums text-neutral-400">—</span>
            </li>
          </ul>
          <p className="text-[10px] text-neutral-600 mt-3 uppercase tracking-widest">
            Live telemetry wires in once the analyzer port ships.
          </p>
        </DsCard>
      </section>

      <section>
        <SectionLabel accent={DS.muted}>Recent Pipeline Events</SectionLabel>
        <DsEmpty
          icon={<AlertTriangle className="w-6 h-6" />}
          title="No events logged"
          body="Event log surfaces failures and drift checks once the live analyzer is running."
        />
      </section>
    </PageShell>
  );
}
