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
  DsCountPill,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { Folder, Plus, ArrowRight, Trash2 } from 'lucide-react';

interface SupplierList {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  suppliers?: Array<{ count: number }>;
}

export default function SupplierIntelListsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [lists, setLists] = useState<SupplierList[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const loadLists = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-intel/lists');
      const json = await res.json();
      if (res.ok) setLists(json.data ?? []);
      else setError(json.error ?? 'Failed to load');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadLists();
  }, [isAuthenticated, loadLists]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/supplier-intel/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to create list');
        return;
      }
      setNewName('');
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete list "${name}"? This removes all suppliers in it.`)) return;
    try {
      const res = await fetch(`/api/supplier-intel/lists/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? 'Failed to delete');
        return;
      }
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel"
        title="Supplier Lists"
        subtitle="Organize suppliers into named collections."
        accent={DS.orange}
        right={<DsCountPill count={lists.length} accent={DS.orange} />}
      />

      <DsCard className="p-5" accent={DS.orange}>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <DsInput
            label="New list name"
            value={newName}
            onChange={setNewName}
            placeholder="e.g. Trade Show Q1 2026"
            className="flex-1"
          />
          <DsButton
            onClick={handleCreate}
            disabled={submitting || !newName.trim()}
            accent={DS.orange}
          >
            <Plus className="w-3.5 h-3.5" /> Create List
          </DsButton>
        </div>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </DsCard>

      {lists.length === 0 ? (
        <DsEmpty
          icon={<Folder className="w-7 h-7" />}
          title="No lists yet"
          body="Create your first supplier list above to start tracking leads."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lists.map((list) => {
            const count = list.suppliers?.[0]?.count ?? 0;
            return (
              <DsCard key={list.id} className="p-5 group" accent={DS.orange}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/supplier-intel/lists/${list.id}`}>
                      <h3
                        className="font-mono uppercase tracking-widest text-sm font-bold text-white truncate hover:text-[#FF6B35] transition-colors cursor-pointer"
                      >
                        {list.name}
                      </h3>
                    </Link>
                    <p className="text-[10px] text-neutral-500 mt-1">
                      {count} supplier{count === 1 ? '' : 's'} · Updated{' '}
                      {new Date(list.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDelete(list.id, list.name)}
                      className="text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                      aria-label="Delete list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <Link href={`/supplier-intel/lists/${list.id}`}>
                      <button className="text-neutral-400 hover:text-[#FF6B35] transition-colors cursor-pointer">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </Link>
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
