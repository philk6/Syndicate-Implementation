'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { Banknote, Landmark, Wallet, AlertCircle, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  DS, PageShell, PageHeader, SectionLabel, DsCard, MetricCard, DsStatusPill,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsEmpty,
} from '@/components/ui/ds';

// Type definitions
interface UserCreditSummary {
  company_id: number;
  total_balance: number;
  available_balance: number;
  held_balance: number;
  last_updated: string;
  company: { name: string } | null;
}

interface Transaction {
  transaction_id: number;
  amount: number;
  transaction_type: string;
  description: string;
  order_id: number | null;
  created_at: string;
  users: { email: string } | null;
}

const TYPE_COLORS: Record<string, string> = {
  deposit: DS.teal,
  credit: DS.teal,
  purchase: DS.orange,
  debit: DS.orange,
  hold: DS.yellow,
  release: DS.blue,
  refund: DS.gold,
  adjustment: '#C77DFF',
};

function txColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? DS.muted;
}

export default function UserCreditDashboardPage() {
  const { isAuthenticated, loading: authLoading, user, session } = useAuth();
  const router = useRouter();

  const [creditSummary, setCreditSummary] = useState<UserCreditSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!session || !user?.company_id) return;
    setLoadingData(true);
    setError(null);

    try {
      const token = session.access_token;
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

      const summaryResponse = await fetch('/api/credits/balance', { headers });
      if (!summaryResponse.ok) {
        const summaryError = await summaryResponse.json();
        throw new Error(`Failed to fetch credit balance: ${summaryError.error}`);
      }
      const summaryData: UserCreditSummary = await summaryResponse.json();
      setCreditSummary(summaryData);

      const historyResponse = await fetch('/api/credits/transactions', { headers });
      if (!historyResponse.ok) {
        const historyError = await historyResponse.json();
        throw new Error(`Failed to fetch transaction history: ${historyError.error}`);
      }
      const historyData: Transaction[] = await historyResponse.json();
      setTransactions(historyData);
    } catch (e: unknown) {
      console.error('Error fetching data:', e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoadingData(false);
    }
  }, [session, user?.company_id]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const hasBuyersGroupAccess = user?.buyersgroup === true || user?.role === 'admin';
    if (!hasBuyersGroupAccess) {
      router.push('/dashboard');
      return;
    }
  }, [isAuthenticated, authLoading, router, user?.buyersgroup, user?.role]);

  useEffect(() => {
    if (session && user?.company_id) fetchData();
  }, [session, user?.company_id, fetchData]);

  if (authLoading || loadingData) {
    return <PageLoadingSpinner />;
  }

  if (error) {
    return (
      <PageShell>
        <DsCard className="p-6 max-w-2xl mx-auto" accent={DS.red}>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: DS.red }} />
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Error</h3>
              <p className="text-xs text-neutral-400">{error}</p>
            </div>
          </div>
        </DsCard>
      </PageShell>
    );
  }

  if (!creditSummary) {
    return (
      <PageShell>
        <DsEmpty
          icon={<Wallet className="w-7 h-7" />}
          title="No Credit Information"
          body="No credit information found for your account."
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        label="Finance"
        title="CREDIT OVERVIEW"
        accent={DS.gold}
        subtitle={creditSummary.company?.name ?? undefined}
        right={
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-0.5">
              Total Balance
            </div>
            <div
              className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight"
              style={{ color: DS.gold, textShadow: `0 0 24px ${DS.gold}44` }}
            >
              ${creditSummary.total_balance.toLocaleString()}
            </div>
          </div>
        }
      />

      {/* Metric cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <MetricCard
          label="Available Credits"
          value={`$${creditSummary.available_balance.toLocaleString()}`}
          sub="Available for investments"
          accent={DS.teal}
          icon={<Banknote className="w-4 h-4" />}
        />
        <MetricCard
          label="Held Credits"
          value={`$${creditSummary.held_balance.toLocaleString()}`}
          sub="Reserved for active orders"
          accent={DS.orange}
          icon={<Wallet className="w-4 h-4" />}
        />
        <MetricCard
          label="Total Credits"
          value={`$${creditSummary.total_balance.toLocaleString()}`}
          sub="Your total credit balance"
          accent={DS.gold}
          icon={<Landmark className="w-4 h-4" />}
        />
      </div>

      {/* Transaction history */}
      <div className="space-y-3">
        <SectionLabel accent={DS.gold}>Transaction History</SectionLabel>

        {transactions.length === 0 ? (
          <DsEmpty
            icon={<Clock className="w-7 h-7" />}
            title="No Transactions"
            body="No transactions found yet."
          />
        ) : (
          <DsTable>
            <DsThead>
              <DsTh>Date</DsTh>
              <DsTh>Type</DsTh>
              <DsTh>Amount</DsTh>
              <DsTh className="hidden sm:table-cell">Description</DsTh>
              <DsTh className="hidden md:table-cell">Order</DsTh>
              <DsTh className="hidden lg:table-cell">Processed By</DsTh>
            </DsThead>
            <tbody>
              {transactions.map((tx) => (
                <DsTr key={tx.transaction_id}>
                  <DsTd className="whitespace-nowrap text-neutral-400 tabular-nums">
                    {new Date(tx.created_at).toLocaleDateString()}{' '}
                    <span className="text-neutral-600">
                      {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </DsTd>
                  <DsTd>
                    <DsStatusPill label={tx.transaction_type} color={txColor(tx.transaction_type)} />
                  </DsTd>
                  <DsTd>
                    <span
                      className="font-bold tabular-nums flex items-center gap-1"
                      style={{ color: tx.amount >= 0 ? DS.teal : DS.red }}
                    >
                      {tx.amount >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()} $
                    </span>
                  </DsTd>
                  <DsTd className="hidden sm:table-cell max-w-[200px] truncate">
                    {tx.description}
                  </DsTd>
                  <DsTd className="hidden md:table-cell">
                    {tx.order_id ? (
                      <a
                        href={`/orders/${tx.order_id}`}
                        className="font-mono font-bold transition-colors"
                        style={{ color: DS.orange }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = DS.gold; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = DS.orange; }}
                      >
                        #{tx.order_id}
                      </a>
                    ) : (
                      <span className="text-neutral-600">--</span>
                    )}
                  </DsTd>
                  <DsTd className="hidden lg:table-cell text-neutral-500">
                    {tx.users?.email || 'System'}
                  </DsTd>
                </DsTr>
              ))}
            </tbody>
          </DsTable>
        )}
      </div>

      {/* Footer */}
      <div className="text-[10px] text-neutral-600 font-mono tracking-wider uppercase text-right">
        Last updated: {new Date(creditSummary.last_updated).toLocaleString()}
      </div>
    </PageShell>
  );
}
