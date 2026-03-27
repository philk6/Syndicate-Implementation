'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GlassCard } from '@/components/ui/glass-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Banknote, Landmark, Wallet, AlertCircle } from 'lucide-react';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';

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

export default function UserCreditDashboardPage() {
  const { isAuthenticated, loading: authLoading, user, session } = useAuth();
  const router = useRouter();

  // Component State
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

      // Fetch user's credit summary
      const summaryResponse = await fetch('/api/credits/balance', { headers });

      if (!summaryResponse.ok) {
        const summaryError = await summaryResponse.json();
        throw new Error(`Failed to fetch credit balance: ${summaryError.error}`);
      }

      const summaryData: UserCreditSummary = await summaryResponse.json();
      setCreditSummary(summaryData);

      // Fetch user's transaction history
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

    // Buyers group access check — admins always have access
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
      <div className="min-h-screen p-6">
        <Alert variant="destructive" className="max-w-2xl mx-auto bg-rose-500/10 border-rose-500/20 text-rose-400 backdrop-blur-md">
          <AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!creditSummary) {
    return (
      <div className="min-h-screen p-6">
        <Alert className="max-w-2xl mx-auto bg-white/[0.03] border-white/[0.08] text-neutral-400 backdrop-blur-md">
          <AlertCircle className="h-4 w-4" /><AlertTitle>No Credit Information</AlertTitle><AlertDescription>No credit information found for your account.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">My Credits</h1>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          {/* Summary Cards */}
          <GlassCard className="p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-neutral-400">Total Credits</h3>
              <Landmark className="h-4 w-4 text-neutral-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">${creditSummary.total_balance.toLocaleString()}</div>
              <p className="text-xs text-neutral-500">Your total credit balance</p>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-neutral-400">Available Credits</h3>
              <Banknote className="h-4 w-4 text-neutral-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">${creditSummary.available_balance.toLocaleString()}</div>
              <p className="text-xs text-neutral-500">Available for investments</p>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-neutral-400">Held Credits</h3>
              <Wallet className="h-4 w-4 text-neutral-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">${creditSummary.held_balance.toLocaleString()}</div>
              <p className="text-xs text-neutral-500">Reserved for active orders</p>
            </div>
          </GlassCard>
        </div>

        <GlassCard>
          <div className="p-6 pb-2">
            <h2 className="text-xl font-semibold text-white">Transaction History</h2>
          </div>

          {transactions.length === 0 ? (
            <div className="p-6">
              <p className="text-neutral-500 text-center py-8">No transactions found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto p-6 pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/[0.05] hover:bg-transparent">
                    <TableHead className="text-neutral-400">Date</TableHead>
                    <TableHead className="text-neutral-400">Type</TableHead>
                    <TableHead className="text-neutral-400">Amount</TableHead>
                    <TableHead className="text-neutral-400">Description</TableHead>
                    <TableHead className="text-neutral-400">Order ID</TableHead>
                    <TableHead className="text-neutral-400">Processed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.transaction_id} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.02]">
                      <TableCell className="text-neutral-200">
                        {new Date(tx.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-neutral-200 capitalize">
                        {tx.transaction_type}
                      </TableCell>
                      <TableCell className={tx.amount >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()} $
                      </TableCell>
                      <TableCell className="text-neutral-200">{tx.description}</TableCell>
                      <TableCell className="text-neutral-200">
                        {tx.order_id ? (
                          <a href={`/orders/${tx.order_id}`} className="text-amber-500 hover:text-amber-400 transition-colors">
                            #{tx.order_id}
                          </a>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-neutral-200">{tx.users?.email || 'System'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>

        <div className="mt-4 text-sm text-neutral-500">
          <p>Last updated: {new Date(creditSummary.last_updated).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}