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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Banknote, Landmark, Wallet, AlertCircle } from 'lucide-react';

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
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if(session && user?.company_id) fetchData();
  }, [session, user?.company_id, fetchData]);

  if (authLoading || loadingData) {
    return <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center"><p className="text-gray-400">Loading Credit Information...</p></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6">
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!creditSummary) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6">
        <Alert className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" /><AlertTitle>No Credit Information</AlertTitle><AlertDescription>No credit information found for your account.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">My Credits</h1>
        
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          {/* Summary Cards */}
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Total Credits</CardTitle>
              <Landmark className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">${creditSummary.total_balance.toLocaleString()}</div>
              <p className="text-xs text-gray-400">Your total credit balance</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Available Credits</CardTitle>
              <Banknote className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">${creditSummary.available_balance.toLocaleString()}</div>
              <p className="text-xs text-gray-400">Available for investments</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Held Credits</CardTitle>
              <Wallet className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-400">${creditSummary.held_balance.toLocaleString()}</div>
              <p className="text-xs text-gray-400">Reserved for active orders</p>
            </CardContent>
          </Card>
        </div>

        <div className="card max-w-full border-[#2b2b2b] border-solid border p-4">
          <h2 className="text-xl font-semibold text-gray-300 mb-4">Transaction History</h2>
          
          {transactions.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No transactions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-gray-300">Date</TableHead>
                    <TableHead className="text-gray-300">Type</TableHead>
                    <TableHead className="text-gray-300">Amount</TableHead>
                    <TableHead className="text-gray-300">Description</TableHead>
                    <TableHead className="text-gray-300">Order ID</TableHead>
                    <TableHead className="text-gray-300">Processed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.transaction_id} className="hover:bg-[#35353580] transition-colors border-[#2b2b2b]">
                      <TableCell className="text-gray-200">
                        {new Date(tx.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-gray-200 capitalize">
                        {tx.transaction_type}
                      </TableCell>
                      <TableCell className={tx.amount >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()} $
                      </TableCell>
                      <TableCell className="text-gray-200">{tx.description}</TableCell>
                      <TableCell className="text-gray-200">
                        {tx.order_id ? (
                          <a href={`/orders/${tx.order_id}`} className="text-[#c8aa64] hover:underline">
                            #{tx.order_id}
                          </a>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-gray-200">{tx.users?.email || 'System'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        
        <div className="mt-4 text-sm text-gray-400">
          <p>Last updated: {new Date(creditSummary.last_updated).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}