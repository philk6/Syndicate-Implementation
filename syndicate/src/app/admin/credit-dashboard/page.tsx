'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
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
import {
  PageShell, PageHeader, SectionLabel, MetricCard, DsCard, DsStatusPill,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsButton, DsInput, DsEmpty, DsCountPill, DS,
} from '@/components/ui/ds';

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
    if (session) fetchData();
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
      setModalFeedback({ type: 'error', text: "All fields are required." });
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
      setModalFeedback({ type: 'success', text: "Credit processed successfully! Refreshing data..." });
      setTimeout(() => { setIsAddModalOpen(false); resetAddModal(); fetchData(); }, 1500);
    } catch (e: unknown) {
      setModalFeedback({ type: 'error', text: e instanceof Error ? e.message : 'An unknown error occurred' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading || loadingData) {
    return (
      <PageShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-neutral-400 font-mono text-sm">Loading Dashboard...</p>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <PageHeader title="CREDIT DASHBOARD" accent={DS.gold} />
        <DsCard accent={DS.red} className="p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#FF4444] shrink-0" />
            <div>
              <p className="text-sm font-bold text-[#FF4444]">Error</p>
              <p className="text-xs text-neutral-400 mt-0.5">{error}</p>
            </div>
          </div>
        </DsCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="CREDIT DASHBOARD"
        accent={DS.gold}
        subtitle="Manage company credit balances and transactions"
        right={
          <DsButton onClick={() => { resetAddModal(); setIsAddModalOpen(true); }} accent={DS.gold}>
            <PlusCircle className="w-3.5 h-3.5" /> Add / Debit Credit
          </DsButton>
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Credits"
          value={`$${stats.totalCredits.toLocaleString()}`}
          sub="Total value in the system"
          accent={DS.gold}
          icon={<Landmark className="w-4 h-4" />}
        />
        <MetricCard
          label="Available Credits"
          value={`$${stats.totalAvailable.toLocaleString()}`}
          sub="Available for use"
          accent={DS.teal}
          icon={<Banknote className="w-4 h-4" />}
        />
        <MetricCard
          label="Total Held"
          value={`$${stats.totalHeld.toLocaleString()}`}
          sub="Amount held in active orders"
          accent={DS.orange}
          icon={<Wallet className="w-4 h-4" />}
        />
        <MetricCard
          label="Active Companies"
          value={stats.activeCompanies}
          sub="Companies with a positive balance"
          accent={DS.blue}
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      {/* Company Credit Summary Table */}
      <div>
        <SectionLabel accent={DS.gold}>
          Company Credit Summary <DsCountPill count={filteredAndSortedSummaries.length} accent={DS.gold} />
        </SectionLabel>

        <div className="mb-4">
          <DsInput
            placeholder="Filter by company name..."
            value={filter}
            onChange={setFilter}
            className="max-w-sm"
          />
        </div>

        {filteredAndSortedSummaries.length === 0 ? (
          <DsEmpty
            icon={<Landmark className="w-6 h-6" />}
            title="No Companies"
            body="No companies match the current filter."
          />
        ) : (
          <DsTable>
            <DsThead>
              <DsTh>
                <button onClick={() => handleSort('company_id')} className="inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors">Company <ArrowUpDown className="w-3 h-3" /></button>
              </DsTh>
              <DsTh>
                <button onClick={() => handleSort('total_balance')} className="inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors">Total Balance <ArrowUpDown className="w-3 h-3" /></button>
              </DsTh>
              <DsTh>
                <button onClick={() => handleSort('available_balance')} className="inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors">Available <ArrowUpDown className="w-3 h-3" /></button>
              </DsTh>
              <DsTh>
                <button onClick={() => handleSort('held_balance')} className="inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors">Held <ArrowUpDown className="w-3 h-3" /></button>
              </DsTh>
              <DsTh>Actions</DsTh>
            </DsThead>
            <tbody>
              {filteredAndSortedSummaries.map((summary) => (
                <DsTr key={summary.company_id}>
                  <DsTd className="font-medium text-white">{summary.company?.name ?? 'N/A'}</DsTd>
                  <DsTd className="font-semibold text-white">${summary.total_balance.toLocaleString()}</DsTd>
                  <DsTd className="font-semibold"><span style={{ color: DS.teal }}>${summary.available_balance.toLocaleString()}</span></DsTd>
                  <DsTd className="text-neutral-400">${summary.held_balance.toLocaleString()}</DsTd>
                  <DsTd>
                    <DsButton variant="ghost" onClick={() => handleViewHistory(summary)} className="text-[10px]">
                      <History className="w-3.5 h-3.5" /> View History
                    </DsButton>
                  </DsTd>
                </DsTr>
              ))}
            </tbody>
          </DsTable>
        )}
      </div>

      {/* Add Credit Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-neutral-200">
          <DialogHeader>
            <DialogTitle className="text-white">Add / Debit Credit</DialogTitle>
            <DialogDescription className="text-neutral-400">Select a company and enter an amount. Use a positive value for credits and a negative value for debits.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="company" className="text-right text-neutral-400">Company</Label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="col-span-3 bg-white/[0.02] text-neutral-200 border-white/[0.05]">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-neutral-200">
                  {summaries.map(s => (<SelectItem key={s.company_id} value={s.company_id.toString()}>{s.company?.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="amount" className="text-right text-neutral-400">Amount</Label>
              <input
                id="amount"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="col-span-3 w-full text-sm text-white border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD70066] placeholder-neutral-600"
                style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                placeholder="e.g., 5000 or -500"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right text-neutral-400">Description</Label>
              <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} className="col-span-3 bg-white/[0.02] text-neutral-200 border-white/[0.05]" placeholder="e.g., Initial funding, Refund for Order #123" />
            </div>
          </div>
          {modalFeedback && (
            <DsCard accent={modalFeedback.type === 'success' ? '#4ade80' : DS.red} className="p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" style={{ color: modalFeedback.type === 'success' ? '#4ade80' : DS.red }} />
                <div>
                  <p className="text-xs font-bold" style={{ color: modalFeedback.type === 'success' ? '#4ade80' : DS.red }}>
                    {modalFeedback.type === 'success' ? 'Success' : 'Error'}
                  </p>
                  <p className="text-xs text-neutral-400">{modalFeedback.text}</p>
                </div>
              </div>
            </DsCard>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <DsButton variant="ghost">Cancel</DsButton>
            </DialogClose>
            <DsButton onClick={handleAddCredit} disabled={isSubmitting} accent={DS.gold}>
              {isSubmitting ? "Processing..." : "Confirm Transaction"}
            </DsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent className="bg-[#0a0a0a]/95 backdrop-blur-xl border-white/[0.08] text-neutral-200 max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Transaction History for {historyCompany?.company?.name}</DialogTitle>
            <DialogDescription className="text-neutral-400">
              A log of all credit and debit transactions for this company.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            {historyLoading ? (
              <p className="text-neutral-500 font-mono text-sm">Loading history...</p>
            ) : historyTransactions.length === 0 ? (
              <DsEmpty
                icon={<History className="w-6 h-6" />}
                title="No Transactions"
                body="No transactions found for this company."
              />
            ) : (
              <DsTable>
                <DsThead>
                  <DsTh>Date</DsTh>
                  <DsTh>Type</DsTh>
                  <DsTh>Amount</DsTh>
                  <DsTh>Description</DsTh>
                  <DsTh>Order ID</DsTh>
                  <DsTh>Processed By</DsTh>
                </DsThead>
                <tbody>
                  {historyTransactions.map((tx) => (
                    <DsTr key={tx.transaction_id}>
                      <DsTd>{new Date(tx.created_at).toLocaleString()}</DsTd>
                      <DsTd>
                        <DsStatusPill
                          label={tx.transaction_type}
                          color={tx.amount >= 0 ? '#4ade80' : DS.red}
                        />
                      </DsTd>
                      <DsTd className="font-semibold">
                        <span style={{ color: tx.amount >= 0 ? '#4ade80' : DS.red }}>
                          {tx.amount >= 0 ? '+' : ''}${tx.amount.toLocaleString()}
                        </span>
                      </DsTd>
                      <DsTd className="text-neutral-400 text-xs">{tx.description}</DsTd>
                      <DsTd>{tx.order_id || 'N/A'}</DsTd>
                      <DsTd className="text-neutral-400 text-xs">{tx.users?.email || 'System'}</DsTd>
                    </DsTr>
                  ))}
                </tbody>
              </DsTable>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
