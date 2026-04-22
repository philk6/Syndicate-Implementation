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
import { BookTemplate, Plus, ArrowLeft } from 'lucide-react';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  sequence_step: number;
  priority: string;
  created_at: string;
}

export default function TemplatesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
    sequence_step: 0,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-intel/follow-up/templates');
      const json = await res.json();
      if (res.ok) setTemplates(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const create = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/supplier-intel/follow-up/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: '', subject: '', body: '', sequence_step: form.sequence_step + 1 });
        await load();
      }
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;

  return (
    <PageShell>
      <PageHeader
        label="Supplier Intel"
        title="Email Templates"
        subtitle="Reusable outreach copy for the follow-up sequence."
        accent={DS.teal}
        right={
          <Link href="/supplier-intel/follow-up">
            <DsButton variant="ghost">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Queue
            </DsButton>
          </Link>
        }
      />

      <DsCard className="p-5" accent={DS.teal}>
        <SectionLabel accent={DS.teal}>Create a new template</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DsInput label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Initial outreach" />
          <DsInput label="Subject" value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} placeholder="e.g. Wholesale inquiry" />
          <DsInput
            label="Sequence step"
            value={String(form.sequence_step)}
            onChange={(v) => setForm({ ...form, sequence_step: Number.parseInt(v, 10) || 0 })}
            type="number"
          />
        </div>
        <div className="mt-3">
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Body</span>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Hi {{company}} team,&#10;&#10;We run a vetted Amazon wholesale operation with a 4-year seller account..."
              rows={7}
              className="w-full text-sm text-white border rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-[#4ECDC466] placeholder-neutral-600"
              style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <DsButton onClick={create} disabled={creating || !form.name || !form.subject || !form.body} accent={DS.teal}>
            <Plus className="w-3.5 h-3.5" />
            {creating ? 'Saving…' : 'Save Template'}
          </DsButton>
        </div>
      </DsCard>

      {templates.length === 0 ? (
        <DsEmpty
          icon={<BookTemplate className="w-7 h-7" />}
          title="No templates yet"
          body="Create a template above to reuse your best outreach copy across the follow-up sequence."
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <DsCard key={t.id} className="p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div>
                  <h3 className="font-mono uppercase tracking-widest text-sm font-bold text-white">{t.name}</h3>
                  <div className="text-[10px] text-neutral-500 mt-0.5 uppercase tracking-widest">Step {t.sequence_step} · {t.priority}</div>
                </div>
                <DsStatusPill label={t.subject} color={DS.teal} />
              </div>
              <pre className="text-xs text-neutral-300 font-sans whitespace-pre-wrap leading-relaxed bg-black/20 border border-white/[0.04] rounded-lg p-3">
                {t.body}
              </pre>
            </DsCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
