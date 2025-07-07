'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowUpDown, Banknote, Landmark, Wallet, Users, PlusCircle, AlertCircle, History } from 'lucide-react';

// Type definitions
interface CompanySummary {
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

interface SummaryResponse {
  summaries: CompanySummary[];
  totals: {
    totalCredits: number;
    totalHeld: number;
    totalAvailable: number;
    activeCompanies: number;
  };
}

type SortKey = keyof Omit<CompanySummary, 'company'>;

export default function CreditDashboardPage() {
  const { isAuthenticated, loading: authLoading, user, session } = useAuth();
  const router = useRouter();

  // Component State
  const [summaries, setSummaries] = useState<CompanySummary[]>([]);
  const [stats, setStats] = useState({ totalCredits: 0, totalHeld: 0, totalAvailable: 0, activeCompanies: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table State
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('company_id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Add Credit Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState('');
  const [modalFeedback, setModalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyCompany, setHistoryCompany] = useState<CompanySummary | null>(null);
  const [historyTransactions, setHistoryTransactions] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session) return;
    setLoadingData(true);
    setError(null);
    
    try {
      const token = session.access_token;
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const summaryResponse = await fetch('/api/admin/credits/summary', { headers });
      
      if (!summaryResponse.ok) {
        const summaryError = await summaryResponse.json();
        throw new Error(`Failed to fetch credit summary: ${summaryError.error}`);
      }
      
      const data: SummaryResponse = await summaryResponse.json();
      setSummaries(data.summaries);
      setStats(data.totals);
      
    } catch (e: unknown) {
      console.error('Error fetching data:', e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
      setLoadingData(false);
    }
  }, [session]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== 'admin') {
      router.push('/login');
      return;
    }
  }, [isAuthenticated, authLoading, user, router]);

  useEffect(() => {
    if(session) fetchData();
  }, [session, fetchData]);

  const handleViewHistory = useCallback(async (company: CompanySummary) => {
    if (!session) return;
    setHistoryCompany(company);
    setIsHistoryModalOpen(true);
    setHistoryLoading(true);
    setHistoryTransactions([]);

    try {
      const token = session.access_token;
      const response = await fetch(`/api/admin/credits/transactions/${company.company_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch history');
      }

      const data: Transaction[] = await response.json();
      setHistoryTransactions(data);
    } catch (e: unknown) {
      console.error('Error fetching transaction history:', e);
      // You could set a specific error state for the history modal here
    } finally {
      setHistoryLoading(false);
    }
  }, [session]);

  const filteredAndSortedSummaries = useMemo(() => {
    const result = summaries.filter(s => s.company?.name?.toLowerCase().includes(filter.toLowerCase()));
    result.sort((a, b) => {
      const valA = sortKey === 'company_id' ? a.company?.name : a[sortKey];
      const valB = sortKey === 'company_id' ? b.company?.name : b[sortKey];
      if (valA == null) return 1;
      if (valB == null) return -1;
      let comparison = 0;
      if (valA > valB) comparison = 1;
      else if (valA < valB) comparison = -1;
      return sortOrder === 'desc' ? comparison * -1 : comparison;
    });
    return result;
  }, [summaries, filter, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortOrder('asc'); }
  };
  
  const resetAddModal = () => {
    setSelectedCompany(''); setAmount(''); setDescription(''); setModalFeedback(null); setIsSubmitting(false);
  }
  
  const handleAddCredit = async () => {
    if (!selectedCompany || !amount || !description) {
      setModalFeedback({ type: 'error', text: "All fields are required."});
      return;
    }
    setIsSubmitting(true);
    setModalFeedback(null);
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Authentication token not found.");
      const response = await fetch('/api/admin/credits/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ company_id: parseInt(selectedCompany), amount: parseFloat(amount), description })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'An unknown error occurred.');
      setModalFeedback({ type: 'success', text: "Credit processed successfully! Refreshing data..."});
      setTimeout(() => { setIsAddModalOpen(false); resetAddModal(); fetchData(); }, 1500);
    } catch (e: unknown) {
      setModalFeedback({ type: 'error', text: e instanceof Error ? e.message : 'An unknown error occurred' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading || loadingData) {
    return <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center"><p className="text-gray-400">Loading Dashboard...</p></div>;
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">Credit Dashboard</h1>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {/* Summary Cards */}
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b]"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-gray-300">Total Credits</CardTitle><Landmark className="h-4 w-4 text-gray-400" /></CardHeader><CardContent><div className="text-2xl font-bold text-white">${stats.totalCredits.toLocaleString()}</div><p className="text-xs text-gray-400">Total value in the system</p></CardContent></Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b]"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-gray-300">Available Credits</CardTitle><Banknote className="h-4 w-4 text-gray-400" /></CardHeader><CardContent><div className="text-2xl font-bold text-white">${stats.totalAvailable.toLocaleString()}</div><p className="text-xs text-gray-400">Available for use</p></CardContent></Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b]"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-gray-300">Total Held</CardTitle><Wallet className="h-4 w-4 text-gray-400" /></CardHeader><CardContent><div className="text-2xl font-bold text-white">${stats.totalHeld.toLocaleString()}</div><p className="text-xs text-gray-400">Amount held in active orders</p></CardContent></Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b]"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-gray-300">Active Companies</CardTitle><Users className="h-4 w-4 text-gray-400" /></CardHeader><CardContent><div className="text-2xl font-bold text-white">{stats.activeCompanies}</div><p className="text-xs text-gray-400">Companies with a positive balance</p></CardContent></Card>
        </div>

        <div className="card max-w-full border-[#2b2b2b] border-solid border p-4">
          <div className="flex justify-between items-center mb-4">
            <Input placeholder="Filter by company name..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]" />
            <Button onClick={() => { resetAddModal(); setIsAddModalOpen(true); }} className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"><PlusCircle className="mr-2 h-4 w-4" /> Add / Debit Credit</Button>
          </div>
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="text-gray-300 cursor-pointer" onClick={() => handleSort('company_id')}>Company <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead><TableHead className="text-gray-300 cursor-pointer" onClick={() => handleSort('total_balance')}>Total Balance <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead><TableHead className="text-gray-300 cursor-pointer" onClick={() => handleSort('available_balance')}>Available Balance <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead><TableHead className="text-gray-300 cursor-pointer" onClick={() => handleSort('held_balance')}>Held Balance <ArrowUpDown className="ml-2 h-4 w-4 inline" /></TableHead><TableHead className="text-gray-300">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredAndSortedSummaries.map((summary) => (
                <TableRow key={summary.company_id} className="hover:bg-[#35353580] transition-colors border-[#2b2b2b]">
                  <TableCell className="text-gray-200 font-medium">{summary.company?.name ?? 'N/A'}</TableCell>
                  <TableCell className="text-gray-200">${summary.total_balance.toLocaleString()}</TableCell>
                  <TableCell className="text-green-400 font-semibold">${summary.available_balance.toLocaleString()}</TableCell>
                  <TableCell className="text-yellow-400">${summary.held_balance.toLocaleString()}</TableCell>
                  <TableCell>
                    <Button onClick={() => handleViewHistory(summary)} variant="outline" size="sm" className="border-[#c8aa64] text-[#c8aa64] hover:bg-[#c8aa64] hover:text-[#242424]"><History className="mr-2 h-4 w-4" />View History</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Credit Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}><DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"><DialogHeader><DialogTitle>Add / Debit Credit</DialogTitle><DialogDescription>Select a company and enter an amount. Use a positive value for credits and a negative value for debits.</DialogDescription></DialogHeader><div className="grid gap-4 py-4"><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="company" className="text-right">Company</Label><Select value={selectedCompany} onValueChange={setSelectedCompany}><SelectTrigger className="col-span-3 bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"><SelectValue placeholder="Select a company" /></SelectTrigger><SelectContent>{summaries.map(s => (<SelectItem key={s.company_id} value={s.company_id.toString()}>{s.company?.name}</SelectItem>))}</SelectContent></Select></div><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="amount" className="text-right">Amount</Label><Input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="col-span-3 bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]" placeholder="e.g., 5000 or -500"/></div><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="description" className="text-right">Description</Label><Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} className="col-span-3 bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]" placeholder="e.g., Initial funding, Refund for Order #123"/></div></div>{modalFeedback && (<Alert variant={modalFeedback.type === 'error' ? 'destructive' : 'default'} className={modalFeedback.type === 'success' ? 'bg-green-900/50 border-green-700' : ''}><AlertCircle className="h-4 w-4" /><AlertTitle>{modalFeedback.type === 'success' ? 'Success' : 'Error'}</AlertTitle><AlertDescription>{modalFeedback.text}</AlertDescription></Alert>)}<DialogFooter><DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose><Button onClick={handleAddCredit} disabled={isSubmitting}>{isSubmitting ? "Processing..." : "Confirm Transaction"}</Button></DialogFooter></DialogContent></Dialog>
      
      {/* History Modal */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80] max-w-4xl">
          <DialogHeader>
            <DialogTitle>Transaction History for {historyCompany?.company?.name}</DialogTitle>
            <DialogDescription>
              A log of all credit and debit transactions for this company.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            {historyLoading ? (
              <p>Loading history...</p>
            ) : historyTransactions.length === 0 ? (
              <p>No transactions found for this company.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Processed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyTransactions.map((tx) => (
                    <TableRow key={tx.transaction_id}>
                      <TableCell>{new Date(tx.created_at).toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{tx.transaction_type}</TableCell>
                      <TableCell className={tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                        ${tx.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>{tx.order_id || 'N/A'}</TableCell>
                      <TableCell>{tx.users?.email || 'System'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
