'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import {
  DS,
  PageShell,
  PageHeader,
  DsCard,
  DsButton,
  DsStatusPill,
  DsEmpty,
  SectionLabel,
  MetricCard,
} from '@/components/ui/ds';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  ArrowLeft,
  Sparkles,
  Mail,
  Phone,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Globe,
  Shield,
  Send,
  X,
} from 'lucide-react';

interface Analysis {
  id: string;
  score: number;
  supplier_quality_score: number;
  amazon_fit_score: number;
  recommendation: string;
  classification: string;
  confidence_level: string;
  priority_level: string;
  reasoning_summary: string;
  green_flags: Array<{ flag: string; evidence?: string; sourcePage?: string; severity?: string }>;
  red_flags: Array<{ flag: string; evidence?: string; sourcePage?: string; severity?: string }>;
  score_breakdown: {
    legitimacy: { score: number };
    wholesaleStructure: { score: number };
    supplyChainDoc: { score: number };
    amazonWholesaleFit: { score: number };
    redFlagPenalty: { penalty: number };
    composite: number;
  };
  analyzed_at: string;
}

interface OutreachEvent {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  note: string | null;
  sequence_step: number;
  created_at: string;
}

interface Supplier {
  id: string;
  company_name: string;
  website: string | null;
  notes: string | null;
  status: string;
  workflow_status: string;
  outreach_status: string;
  sequence_step: number;
  list: { id: string; name: string } | null;
  analyses: Analysis[];
  outreach_events: OutreachEvent[];
  created_at: string;
}

function recColor(r: string): string {
  if (r === 'STRONG_CANDIDATE') return DS.teal;
  if (r === 'NEEDS_REVIEW') return DS.yellow;
  if (r === 'HIGH_RISK') return DS.red;
  return DS.muted;
}

function statusColor(s: string): string {
  if (s === 'DONE') return DS.teal;
  if (s === 'ANALYZING') return DS.blue;
  if (s === 'FAILED') return DS.red;
  return DS.muted;
}

export default function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = use(params);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/supplier-intel/suppliers/${supplierId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load');
        return;
      }
      setSupplier(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const runAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/supplier-intel/analyze/${supplierId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Analyze failed');
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyze failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const logEvent = async (type: string, subject?: string, body?: string) => {
    try {
      const res = await fetch(`/api/supplier-intel/suppliers/${supplierId}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          subject,
          body,
          sequence_step: (supplier?.sequence_step ?? 0) + 1,
        }),
      });
      if (res.ok) await load();
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || loading) return <PageLoadingSpinner />;
  if (!isAuthenticated) return null;
  if (error && !supplier) {
    return (
      <PageShell>
        <PageHeader label="Supplier Intel" title="Supplier Not Found" accent={DS.red} />
        <p className="text-sm text-neutral-400">{error}</p>
        <Link href="/supplier-intel/lists">
          <DsButton variant="ghost">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Lists
          </DsButton>
        </Link>
      </PageShell>
    );
  }
  if (!supplier) return null;

  const latest = supplier.analyses?.[0] ?? null;

  return (
    <PageShell>
      <PageHeader
        label={supplier.list ? `List · ${supplier.list.name}` : 'Supplier Intel'}
        title={supplier.company_name}
        subtitle={supplier.website ? supplier.website.replace(/^https?:\/\//, '') : 'No website on file'}
        accent={latest ? recColor(latest.recommendation) : DS.orange}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            {supplier.list && (
              <Link href={`/supplier-intel/lists/${supplier.list.id}`}>
                <DsButton variant="ghost">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to List
                </DsButton>
              </Link>
            )}
            <DsButton
              onClick={runAnalyze}
              disabled={analyzing || supplier.status === 'ANALYZING'}
              accent={DS.orange}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {analyzing ? 'Analyzing…' : latest ? 'Re-analyze' : 'Analyze Supplier'}
            </DsButton>
            <DsButton variant="secondary" onClick={() => setChatOpen(true)} accent={DS.teal}>
              <MessageSquare className="w-3.5 h-3.5" /> Ask AI
            </DsButton>
          </div>
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Composite Score"
          value={latest?.score ?? '—'}
          accent={latest ? recColor(latest.recommendation) : DS.muted}
          icon={<Shield className="w-4 h-4" />}
          sub={latest ? `${latest.confidence_level} confidence` : 'Not analyzed'}
        />
        <MetricCard
          label="Amazon Fit"
          value={latest?.amazon_fit_score ?? '—'}
          accent={DS.blue}
          icon={<Building2 className="w-4 h-4" />}
          sub="Wholesale-authorization fit"
        />
        <MetricCard
          label="Recommendation"
          value={latest?.recommendation ?? '—'}
          accent={latest ? recColor(latest.recommendation) : DS.muted}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricCard
          label="Classification"
          value={latest?.classification ?? '—'}
          accent={DS.orange}
          icon={<Globe className="w-4 h-4" />}
          sub={latest ? `${latest.priority_level} priority` : undefined}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DsCard className="p-5">
          <SectionLabel accent={DS.orange}>Workflow</SectionLabel>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 uppercase tracking-widest">Status</span>
              <DsStatusPill label={supplier.status} color={statusColor(supplier.status)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 uppercase tracking-widest">Workflow</span>
              <span className="font-mono uppercase text-neutral-300">{supplier.workflow_status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 uppercase tracking-widest">Outreach</span>
              <span className="font-mono uppercase text-neutral-300">{supplier.outreach_status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 uppercase tracking-widest">Sequence</span>
              <span className="font-mono tabular-nums text-neutral-300">Step {supplier.sequence_step}</span>
            </div>
          </div>
        </DsCard>

        <DsCard className="p-5 md:col-span-2">
          <SectionLabel accent={DS.teal}>Log an Outreach Event</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <DsButton
              variant="secondary"
              accent={DS.teal}
              onClick={() => logEvent('EMAIL_LOGGED', 'Initial outreach', 'Sent first-touch email via personal domain.')}
            >
              <Mail className="w-3.5 h-3.5" /> Log Email Sent
            </DsButton>
            <DsButton
              variant="secondary"
              accent={DS.blue}
              onClick={() => logEvent('CALL_LOGGED', null as unknown as string, 'Spoke with wholesale manager.')}
            >
              <Phone className="w-3.5 h-3.5" /> Log Call
            </DsButton>
            <DsButton
              variant="secondary"
              accent={DS.yellow}
              onClick={() => logEvent('REPLY_LOGGED', 'Reply received', 'They asked for our EIN and resale cert.')}
            >
              <Send className="w-3.5 h-3.5" /> Log Reply
            </DsButton>
            <DsButton
              variant="secondary"
              accent={DS.muted}
              onClick={() => logEvent('NOTE', null as unknown as string, null as unknown as string)}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Add Note
            </DsButton>
          </div>
        </DsCard>
      </section>

      {latest && (
        <>
          <section>
            <SectionLabel accent={recColor(latest.recommendation)}>AI Reasoning</SectionLabel>
            <DsCard className="p-5" accent={recColor(latest.recommendation)}>
              <p className="text-sm text-neutral-300 font-sans leading-relaxed whitespace-pre-wrap">
                {latest.reasoning_summary}
              </p>
              <p className="mt-3 text-[10px] text-neutral-500 uppercase tracking-widest">
                Analyzed {new Date(latest.analyzed_at).toLocaleString()}
              </p>
            </DsCard>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DsCard className="p-5" accent={DS.teal}>
              <SectionLabel accent={DS.teal}>Green Flags · {latest.green_flags.length}</SectionLabel>
              {latest.green_flags.length === 0 ? (
                <p className="text-xs text-neutral-500">None detected.</p>
              ) : (
                <ul className="space-y-2">
                  {latest.green_flags.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-sans leading-snug">{g.flag}</div>
                        {g.evidence && <div className="text-[10px] text-neutral-500 mt-0.5">{g.evidence}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DsCard>

            <DsCard className="p-5" accent={DS.red}>
              <SectionLabel accent={DS.red}>Red Flags · {latest.red_flags.length}</SectionLabel>
              {latest.red_flags.length === 0 ? (
                <p className="text-xs text-neutral-500">None detected.</p>
              ) : (
                <ul className="space-y-2">
                  {latest.red_flags.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-sans leading-snug">{r.flag}</div>
                        {r.evidence && <div className="text-[10px] text-neutral-500 mt-0.5">{r.evidence}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DsCard>
          </section>

          <section>
            <SectionLabel accent={DS.orange}>Score Breakdown</SectionLabel>
            <DsCard className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <ScoreBar label="Legitimacy" score={latest.score_breakdown.legitimacy.score} color={DS.teal} />
                <ScoreBar label="Wholesale Structure" score={latest.score_breakdown.wholesaleStructure.score} color={DS.blue} />
                <ScoreBar label="Supply-Chain Doc" score={latest.score_breakdown.supplyChainDoc.score} color={DS.orange} />
                <ScoreBar label="Amazon Fit" score={latest.score_breakdown.amazonWholesaleFit.score} color={DS.gold} />
                <ScoreBar
                  label="Red Flag Penalty"
                  score={latest.score_breakdown.redFlagPenalty.penalty}
                  color={DS.red}
                  inverse
                />
              </div>
            </DsCard>
          </section>
        </>
      )}

      <section>
        <SectionLabel accent={DS.muted}>Outreach History</SectionLabel>
        {supplier.outreach_events.length === 0 ? (
          <DsEmpty
            icon={<Mail className="w-6 h-6" />}
            title="No outreach events yet"
            body="Log your first email, call, or note using the buttons above."
          />
        ) : (
          <div className="space-y-2">
            {supplier.outreach_events
              .slice()
              .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
              .map((e) => (
                <DsCard key={e.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 w-28 pt-0.5 shrink-0">
                      {e.type.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      {e.subject && <div className="text-sm text-white font-sans">{e.subject}</div>}
                      {e.body && <div className="text-xs text-neutral-400 mt-0.5 font-sans whitespace-pre-wrap">{e.body}</div>}
                      {e.note && <div className="text-xs text-neutral-500 mt-1 font-sans italic">{e.note}</div>}
                      <div className="text-[10px] text-neutral-600 mt-1.5 tabular-nums">
                        {new Date(e.created_at).toLocaleString()} · Step {e.sequence_step}
                      </div>
                    </div>
                  </div>
                </DsCard>
              ))}
          </div>
        )}
      </section>

      {chatOpen && latest && (
        <ChatWidget
          onClose={() => setChatOpen(false)}
          supplierContext={{
            companyName: supplier.company_name,
            website: supplier.website ?? undefined,
            score: latest.score,
            recommendation: latest.recommendation,
            classification: latest.classification,
            confidence: latest.confidence_level,
            greenFlags: latest.green_flags.map((g) => g.flag),
            redFlags: latest.red_flags.map((r) => r.flag),
            reasoningSummary: latest.reasoning_summary,
          }}
        />
      )}
    </PageShell>
  );
}

function ScoreBar({
  label,
  score,
  color,
  inverse = false,
}: {
  label: string;
  score: number;
  color: string;
  inverse?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</span>
        <span className="text-xs font-mono tabular-nums font-bold" style={{ color }}>
          {inverse ? `-${score}` : score}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(0, Math.min(100, score))}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}

function ChatWidget({
  onClose,
  supplierContext,
}: {
  onClose: () => void;
  supplierContext: {
    companyName: string;
    website?: string;
    score?: number;
    recommendation?: string;
    classification?: string;
    confidence?: string;
    greenFlags?: string[];
    redFlags?: string[];
    reasoningSummary?: string;
  };
}) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: `I have the analysis for ${supplierContext.companyName} loaded. Ask me about the flags, request an outreach draft, or compare with another supplier.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setMessages((m) => [...m, { role: 'user', content: userMsg }]);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/supplier-intel/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, supplierContext }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: json.data.reply }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: `Error: ${json.error}` }]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'request failed'}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6">
      <div
        className="w-full max-w-2xl h-[80vh] md:h-[75vh] rounded-t-2xl md:rounded-2xl border flex flex-col overflow-hidden"
        style={{ backgroundColor: DS.bg, borderColor: `${DS.teal}55` }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: DS.cardBorder, backgroundColor: `${DS.teal}10` }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">AI Analyst</div>
              <div className="text-sm font-mono text-white">{supplierContext.companyName}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs font-sans leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-orange-500/20 text-orange-100 border border-orange-500/40'
                    : 'bg-white/5 text-neutral-200 border border-white/10'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3.5 py-2.5 bg-white/5 border border-white/10 text-xs text-neutral-500 italic">
                Thinking…
              </div>
            </div>
          )}
        </div>
        <div className="border-t p-3 flex items-center gap-2" style={{ borderColor: DS.cardBorder }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about flags, draft an email, compare suppliers…"
            className="flex-1 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4ECDC466] placeholder-neutral-600 border"
            style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
          />
          <DsButton onClick={send} disabled={sending || !input.trim()} accent={DS.teal}>
            <Send className="w-3.5 h-3.5" />
          </DsButton>
        </div>
      </div>
    </div>
  );
}
