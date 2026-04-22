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
  DsInput,
  DsEmpty,
  DsStatusPill,
  SectionLabel,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { Search, Compass, Plus, ArrowRight, Target } from 'lucide-react';

interface Candidate {
  id: string;
  company_name: string;
  website: string | null;
  location: string | null;
  estimated_type: string | null;
  authorization_level: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
  authorization_reasoning: string | null;
  authorization_evidence: string[];
  relevance_score: number;
  confidence_score: number;
  supplier_id: string | null;
  added_to_list_at: string | null;
}

interface SearchDetail {
  id: string;
  brand: string | null;
  category: string | null;
  location: string | null;
  status: string;
  total_found: number;
  created_at: string;
  completed_at: string | null;
  candidates: Candidate[];
}

interface SearchSummary {
  id: string;
  brand: string | null;
  category: string | null;
  location: string | null;
  status: string;
  total_found: number;
  created_at: string;
  candidates?: Array<{ count: number }>;
}

interface SupplierList {
  id: string;
  name: string;
}

function authColor(l: string): string {
  if (l === 'STRONG') return DS.teal;
  if (l === 'MODERATE') return DS.yellow;
  if (l === 'WEAK') return DS.orange;
  return DS.muted;
}

export default function DiscoveryPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<SearchSummary[]>([]);
  const [active, setActive] = useState<SearchDetail | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [lists, setLists] = useState<SupplierList[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<string>('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-intel/discovery');
      const json = await res.json();
      if (res.ok) setHistory(json.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadLists = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-intel/lists');
      const json = await res.json();
      if (res.ok) {
        setLists(json.data ?? []);
        if (json.data?.[0] && !selectedList) setSelectedList(json.data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedList]);

  useEffect(() => {
    if (isAuthenticated) {
      loadHistory();
      loadLists();
    }
  }, [isAuthenticated, loadHistory, loadLists]);

  const loadSearch = async (searchId: string) => {
    try {
      const res = await fetch(`/api/supplier-intel/discovery/${searchId}`);
      const json = await res.json();
      if (res.ok) setActive(json.data);
    } catch (err) {
      console.error(err);
    }
  };

  const runSearch = async () => {
    if (!brand.trim() && !category.trim()) {
      setError('Enter a brand or a category to begin discovery.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch('/api/supplier-intel/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brand.trim(), category: category.trim(), location: location.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Discovery failed');
        return;
      }
      await loadHistory();
      await loadSearch(json.data.searchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setSearching(false);
    }
  };

  const addToList = async (candidateId: string) => {
    if (!active || !selectedList) return;
    setAdding(candidateId);
    try {
      const res = await fetch(`/api/supplier-intel/discovery/${active.id}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, listId: selectedList }),
      });
      if (res.ok) await loadSearch(active.id);
    } finally {
      setAdding(null);
    }
  };

  if (authLoading || loadingHistory) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel"
        title="Discovery"
        subtitle="Hunt for authorized distributors by brand, category, or region."
        accent={DS.teal}
        right={
          <Link href="/supplier-intel/dashboard">
            <DsButton variant="ghost">Back to Dashboard</DsButton>
          </Link>
        }
      />

      <DsCard className="p-5" accent={DS.teal}>
        <SectionLabel accent={DS.teal}>New Discovery Search</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DsInput label="Brand" value={brand} onChange={setBrand} placeholder="e.g. Yeti, Nike, Anker" />
          <DsInput label="Category" value={category} onChange={setCategory} placeholder="e.g. pet supplements" />
          <DsInput label="Location (optional)" value={location} onChange={setLocation} placeholder="e.g. Texas, USA" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
            Stubbed model · Claude-backed discovery wires in next session
          </p>
          <DsButton onClick={runSearch} disabled={searching} accent={DS.teal}>
            <Search className="w-3.5 h-3.5" />
            {searching ? 'Hunting…' : 'Find Distributors'}
          </DsButton>
        </div>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </DsCard>

      {active ? (
        <section>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <SectionLabel accent={DS.orange}>
              Results · {active.candidates.length} candidates
            </SectionLabel>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest">Add to list</span>
              <select
                value={selectedList}
                onChange={(e) => setSelectedList(e.target.value)}
                className="text-xs text-white rounded-lg px-2 py-1.5 border font-mono"
                style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
              >
                {lists.length === 0 && <option value="">No lists available</option>}
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <DsButton variant="ghost" onClick={() => setActive(null)}>
                Close
              </DsButton>
            </div>
          </div>
          <div className="space-y-2">
            {active.candidates.map((c) => (
              <DsCard key={c.id} className="p-4" accent={authColor(c.authorization_level)}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-mono uppercase tracking-widest text-sm font-bold text-white">
                        {c.company_name}
                      </h4>
                      <DsStatusPill
                        label={c.authorization_level}
                        color={authColor(c.authorization_level)}
                      />
                      {c.added_to_list_at && (
                        <DsStatusPill label="In list" color={DS.teal} />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-1 uppercase tracking-widest font-mono">
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-[#FF6B35] hover:underline">
                          {c.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                      {c.location && <span>{c.location}</span>}
                      <span>Relevance {Math.round(c.relevance_score * 100)}</span>
                      <span>Confidence {c.confidence_score}/10</span>
                    </div>
                    {c.authorization_reasoning && (
                      <p className="text-xs text-neutral-400 mt-2 font-sans leading-relaxed max-w-3xl">
                        {c.authorization_reasoning}
                      </p>
                    )}
                    {c.authorization_evidence?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.authorization_evidence.map((e, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest text-neutral-400 border border-white/[0.08]"
                            style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                          >
                            {e.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {c.added_to_list_at ? (
                      <span className="text-[10px] text-neutral-500 uppercase tracking-widest">
                        Added {new Date(c.added_to_list_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <DsButton
                        onClick={() => addToList(c.id)}
                        disabled={!selectedList || adding === c.id}
                        accent={DS.teal}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {adding === c.id ? 'Adding…' : 'Add to List'}
                      </DsButton>
                    )}
                  </div>
                </div>
              </DsCard>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <SectionLabel accent={DS.muted}>Recent Searches</SectionLabel>
          {history.length === 0 ? (
            <DsEmpty
              icon={<Compass className="w-7 h-7" />}
              title="No searches yet"
              body="Run your first discovery search above. Results populate here."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {history.map((s) => {
                const count = s.candidates?.[0]?.count ?? s.total_found ?? 0;
                return (
                  <DsCard key={s.id} className="p-4 cursor-pointer" onClick={() => loadSearch(s.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Target className="w-3.5 h-3.5 text-[#FF6B35]" />
                          <span className="font-mono uppercase tracking-widest text-sm font-bold text-white">
                            {s.brand || s.category || 'Broad search'}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-1 uppercase tracking-widest font-mono">
                          {[s.category, s.location].filter(Boolean).join(' · ') || 'Any region'}
                        </div>
                        <div className="text-xs text-neutral-400 mt-2 tabular-nums">
                          {count} candidates · {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-neutral-500 shrink-0" />
                    </div>
                  </DsCard>
                );
              })}
            </div>
          )}
        </section>
      )}
    </PageShell>
  );
}
