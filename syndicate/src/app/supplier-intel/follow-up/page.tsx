'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS,
  PageShell,
  PageHeader,
  DsCard,
  DsButton,
  DsEmpty,
  DsStatusPill,
  DsCountPill,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { Inbox, Mail, Phone, CheckCircle2, ArrowRight, BookTemplate } from 'lucide-react';

interface FollowUp {
  id: string;
  supplier_id: string;
  tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  assigned_to: string | null;
  notes: string | null;
  next_follow_up_date: string | null;
  last_contacted_at: string | null;
  contact_method: string | null;
  supplier: {
    id: string;
    company_name: string;
    website: string | null;
    outreach_status: string;
  } | null;
  created_at: string;
}

function tierColor(t: string): string {
  if (t === 'TIER_1') return DS.teal;
  if (t === 'TIER_2') return DS.yellow;
  return DS.muted;
}
function priorityColor(p: string): string {
  if (p === 'HIGH') return DS.red;
  if (p === 'MEDIUM') return DS.yellow;
  return DS.muted;
}

export default function FollowUpQueuePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [queue, setQueue] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<'ALL' | 'TIER_1' | 'TIER_2' | 'TIER_3'>('ALL');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-intel/follow-up/queue');
      const json = await res.json();
      if (res.ok) setQueue(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const logAction = async (followUpId: string, action: string) => {
    await fetch('/api/supplier-intel/follow-up/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follow_up_id: followUpId, action }),
    });
    await load();
  };

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  const filtered = tier === 'ALL' ? queue : queue.filter((f) => f.tier === tier);
  const overdue = filtered.filter(
    (f) => f.next_follow_up_date && new Date(f.next_follow_up_date) < new Date(),
  );

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel"
        title="Follow-Up Queue"
        subtitle="Suppliers waiting on your next touch."
        accent={DS.yellow}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <DsCountPill count={filtered.length} accent={DS.yellow} />
            <Link href="/supplier-intel/follow-up/templates">
              <DsButton variant="secondary" accent={DS.teal}>
                <BookTemplate className="w-3.5 h-3.5" /> Templates
              </DsButton>
            </Link>
          </div>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        {(['ALL', 'TIER_1', 'TIER_2', 'TIER_3'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest font-mono border transition-colors"
            style={{
              backgroundColor: tier === t ? `${DS.yellow}22` : 'transparent',
              borderColor: tier === t ? `${DS.yellow}66` : 'rgba(255,255,255,0.08)',
              color: tier === t ? DS.yellow : DS.textDim,
            }}
          >
            {t === 'ALL' ? 'All Tiers' : t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {overdue.length > 0 && (
        <DsCard className="p-4" accent={DS.red}>
          <div className="flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-rose-400">
            <Inbox className="w-4 h-4" />
            {overdue.length} overdue follow-up{overdue.length === 1 ? '' : 's'}
          </div>
        </DsCard>
      )}

      {filtered.length === 0 ? (
        <DsEmpty
          icon={<Inbox className="w-7 h-7" />}
          title="Queue is empty"
          body="Follow-ups appear here when a supplier's next action date comes due."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const due = f.next_follow_up_date ? new Date(f.next_follow_up_date) : null;
            const isOverdue = due && due < new Date();
            return (
              <DsCard key={f.id} className="p-4" accent={priorityColor(f.priority)}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {f.supplier && (
                        <Link
                          href={`/supplier-intel/suppliers/${f.supplier.id}`}
                          className="font-mono uppercase tracking-widest text-sm font-bold text-white hover:text-[#FF6B35]"
                        >
                          {f.supplier.company_name}
                        </Link>
                      )}
                      <DsStatusPill label={f.tier.replace('_', ' ')} color={tierColor(f.tier)} />
                      <DsStatusPill label={`${f.priority} pri`} color={priorityColor(f.priority)} />
                      {f.supplier?.outreach_status && (
                        <DsStatusPill label={f.supplier.outreach_status} color={DS.blue} />
                      )}
                    </div>
                    {f.notes && (
                      <p className="text-xs text-neutral-400 mt-1.5 font-sans max-w-3xl">{f.notes}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-2 uppercase tracking-widest font-mono">
                      {due && (
                        <span style={{ color: isOverdue ? DS.red : DS.textDim }}>
                          Due {due.toLocaleDateString()}
                        </span>
                      )}
                      {f.last_contacted_at && (
                        <span>Last contact {new Date(f.last_contacted_at).toLocaleDateString()}</span>
                      )}
                      {f.assigned_to && <span>Assigned: {f.assigned_to}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <DsButton variant="secondary" accent={DS.teal} onClick={() => logAction(f.id, 'EMAIL_SENT')}>
                      <Mail className="w-3.5 h-3.5" /> Email
                    </DsButton>
                    <DsButton variant="secondary" accent={DS.blue} onClick={() => logAction(f.id, 'CALL_MADE')}>
                      <Phone className="w-3.5 h-3.5" /> Call
                    </DsButton>
                    <DsButton variant="secondary" accent={DS.muted} onClick={() => logAction(f.id, 'COMPLETED')}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Done
                    </DsButton>
                    {f.supplier && (
                      <Link href={`/supplier-intel/suppliers/${f.supplier.id}`}>
                        <DsButton variant="ghost">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </DsButton>
                      </Link>
                    )}
                  </div>
                </div>
              </DsCard>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
