'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS,
  PageShell,
  PageHeader,
  DsTable,
  DsThead,
  DsTh,
  DsTr,
  DsTd,
  DsEmpty,
  DsStatusPill,
  DsButton,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, Building2 } from 'lucide-react';

interface Supplier {
  id: string;
  company_name: string;
  website: string | null;
  status: string;
  workflow_status: string;
  outreach_status: string;
  analyses?: Array<{ recommendation: string; score: number; analyzed_at: string }>;
  created_at: string;
}

interface SupplierListDetail {
  list: { id: string; name: string; created_at: string };
  suppliers: Supplier[];
}

function statusColor(status: string): string {
  switch (status) {
    case 'STRONG_CANDIDATE': return DS.teal;
    case 'HIGH_RISK': return DS.red;
    case 'NEEDS_REVIEW': return DS.yellow;
    case 'DONE': return DS.teal;
    case 'FAILED': return DS.red;
    case 'ANALYZING': return DS.blue;
    default: return DS.muted;
  }
}

export default function SupplierListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = use(params);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<SupplierListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/supplier-intel/lists/${listId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load');
        return;
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  if (error || !data) {
    return (
      <PageShell>
        <PageHeader label="Supplier Intel" title="List Not Found" accent={DS.red} />
        <p className="text-sm text-neutral-400">{error ?? 'The list could not be loaded.'}</p>
        <Link href="/supplier-intel/lists">
          <DsButton variant="ghost">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Lists
          </DsButton>
        </Link>
      </PageShell>
    );
  }

  const { list, suppliers } = data;

  return (
    <PageShell>
      <PageHeader
        label={`Created ${new Date(list.created_at).toLocaleDateString()}`}
        title={list.name}
        subtitle={`${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'}`}
        accent={DS.orange}
        right={
          <Link href="/supplier-intel/lists">
            <DsButton variant="ghost">
              <ArrowLeft className="w-3.5 h-3.5" /> All Lists
            </DsButton>
          </Link>
        }
      />

      {suppliers.length === 0 ? (
        <DsEmpty
          icon={<Building2 className="w-7 h-7" />}
          title="No suppliers in this list"
          body="Supplier creation, CSV import, and AI analysis arrive in the next port phase."
        />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>Company</DsTh>
            <DsTh>Website</DsTh>
            <DsTh>Status</DsTh>
            <DsTh>Workflow</DsTh>
            <DsTh>Recommendation</DsTh>
            <DsTh>Added</DsTh>
          </DsThead>
          <tbody>
            {suppliers.map((s) => {
              const latest = s.analyses?.[0];
              return (
                <DsTr key={s.id}>
                  <DsTd className="font-medium text-white">{s.company_name}</DsTd>
                  <DsTd>
                    {s.website ? (
                      <a
                        href={s.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#FF6B35] hover:underline"
                      >
                        {s.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      '—'
                    )}
                  </DsTd>
                  <DsTd>
                    <DsStatusPill label={s.status} color={statusColor(s.status)} />
                  </DsTd>
                  <DsTd>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                      {s.workflow_status}
                    </span>
                  </DsTd>
                  <DsTd>
                    {latest ? (
                      <DsStatusPill
                        label={latest.recommendation}
                        color={statusColor(latest.recommendation)}
                      />
                    ) : (
                      <span className="text-neutral-500 text-xs">Not analyzed</span>
                    )}
                  </DsTd>
                  <DsTd>
                    <span className="text-neutral-400 text-xs tabular-nums">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </DsTd>
                </DsTr>
              );
            })}
          </tbody>
        </DsTable>
      )}
    </PageShell>
  );
}
