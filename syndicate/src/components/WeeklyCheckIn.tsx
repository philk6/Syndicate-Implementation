'use client';

import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Loader2, Send, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchThisWeekCheckin,
  submitWeeklyCheckin,
  type WeeklyCheckin,
} from '@/lib/weeklyCheckin';

interface WeeklyCheckInProps {
  userId: string;
  companyId: number | null;
  phaseId: number;          // 1..5 — drives which bonus event to claim
  phaseColor: string;       // accent color
  phaseName: string;        // e.g. "ESTABLISH BASE"
}

export function WeeklyCheckIn({
  userId,
  companyId,
  phaseId,
  phaseColor,
  phaseName,
}: WeeklyCheckInProps) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<WeeklyCheckin | null>(null);
  const [accomplished, setAccomplished] = useState('');
  const [nextWeekGoal, setNextWeekGoal] = useState('');
  const [suppliers, setSuppliers] = useState('');
  const [calls, setCalls] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ xp: number } | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const row = await fetchThisWeekCheckin(userId);
        if (!cancel) setExisting(row);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [userId]);

  const canSubmit =
    accomplished.trim().length > 0 &&
    nextWeekGoal.trim().length > 0 &&
    suppliers.trim().length > 0 &&
    calls.trim().length > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitWeeklyCheckin({
        userId,
        companyId,
        accomplished: accomplished.trim(),
        nextWeekGoal: nextWeekGoal.trim(),
        suppliersContacted: Math.max(0, parseInt(suppliers, 10) || 0),
        callsMade: Math.max(0, parseInt(calls, 10) || 0),
        eventCode: `phase${phaseId}_weekly_checkin`,
      });
      setFlash({ xp: result.awardedXp });
      // Re-fetch to swap into submitted state
      const row = await fetchThisWeekCheckin(userId);
      setExisting(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submit failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="relative rounded-2xl border  p-6 overflow-hidden font-mono"
        style={{ borderColor: `${phaseColor}33`, backgroundColor: 'rgba(10,10,15,0.6)' }}
      >
        <div className="flex items-center gap-2 text-neutral-500 text-xs">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading weekly check-in…
        </div>
      </div>
    );
  }

  // ── Already submitted this week ─────────────────────────────────────────
  if (existing) {
    return (
      <div
        className="relative rounded-2xl border  p-6 overflow-hidden font-mono"
        style={{
          borderColor: phaseColor,
          backgroundColor: 'rgba(10,10,15,0.6)',
          boxShadow: `0 0 32px ${phaseColor}55, inset 0 0 16px ${phaseColor}22`,
        }}
      >
        <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: phaseColor, boxShadow: `0 0 12px ${phaseColor}` }} />
        <div className="pl-2 flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${phaseColor}1a`, borderColor: `${phaseColor}66`, color: phaseColor }}
          >
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: phaseColor }}>
              Weekly Check-In · {phaseName}
            </p>
            <h3 className="text-sm font-bold text-white">Submitted for this week ✓</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {new Date(existing.submitted_at).toLocaleDateString()} · See you next week!
            </p>
          </div>
        </div>

        <div className="pl-2 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat phaseColor={phaseColor} label="Suppliers" value={existing.suppliers_contacted} />
          <Stat phaseColor={phaseColor} label="Calls" value={existing.calls_made} />
          <Stat phaseColor={phaseColor} label="XP Earned" value="+50" icon={<Zap className="w-3 h-3" />} />
          <Stat phaseColor={phaseColor} label="Week" value={existing.week_start.slice(5)} />
        </div>

        <div className="pl-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Excerpt phaseColor={phaseColor} label="Accomplished" text={existing.accomplished} />
          <Excerpt phaseColor={phaseColor} label="Next Week" text={existing.next_week_goal} />
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative rounded-2xl border  p-6 overflow-hidden font-mono"
      style={{
        borderColor: `${phaseColor}66`,
        backgroundColor: 'rgba(10,10,15,0.6)',
        boxShadow: `0 0 24px ${phaseColor}33`,
      }}
    >
      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: phaseColor, boxShadow: `0 0 12px ${phaseColor}` }} />

      <div className="pl-2 flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${phaseColor}1a`, borderColor: `${phaseColor}66`, color: phaseColor }}
        >
          <Calendar className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: phaseColor }}>
            Weekly Check-In · {phaseName}
          </p>
          <h3 className="text-lg font-black text-white uppercase tracking-wider">
            Log this week&apos;s ops
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" style={{ color: phaseColor }} />
            +50 XP for submitting · resets every Monday
          </p>
        </div>
      </div>

      <div className="pl-2 space-y-3">
        <Field
          phaseColor={phaseColor}
          label="What did you accomplish this week?"
          value={accomplished}
          onChange={setAccomplished}
          rows={3}
          placeholder="Booked 3 supplier calls, closed 1 account, shipped first PO…"
        />
        <Field
          phaseColor={phaseColor}
          label="What is your goal for next week?"
          value={nextWeekGoal}
          onChange={setNextWeekGoal}
          rows={3}
          placeholder="Lock in 2 more accounts, finalize pricing with supplier X…"
        />

        <div className="grid grid-cols-2 gap-3">
          <NumField
            phaseColor={phaseColor}
            label="Suppliers contacted"
            value={suppliers}
            onChange={setSuppliers}
          />
          <NumField
            phaseColor={phaseColor}
            label="Calls made"
            value={calls}
            onChange={setCalls}
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'relative w-full py-3 rounded-xl border font-bold font-mono text-xs uppercase tracking-[0.3em] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
          )}
          style={{
            backgroundColor: `${phaseColor}1a`,
            borderColor: phaseColor,
            color: phaseColor,
            boxShadow: canSubmit ? `0 0 20px ${phaseColor}55` : 'none',
          }}
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            <span className="inline-flex items-center gap-2">
              <Send className="w-3.5 h-3.5" />
              Submit Check-In · +50 XP
            </span>
          )}

          {flash && (
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-bold animate-[wkFlash_1.8s_ease-out_forwards]"
              style={{ color: phaseColor, textShadow: `0 0 18px ${phaseColor}` }}
            >
              +{flash.xp} XP · See you next week!
            </span>
          )}
        </button>
      </div>

      <style jsx global>{`
        @keyframes wkFlash {
          0%   { opacity: 0; transform: translateY(8px); }
          15%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}

// ─── Small presentational helpers ───────────────────────────────────────────

function Field({
  phaseColor, label, value, onChange, rows = 3, placeholder,
}: { phaseColor: string; label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-none bg-white/[0.03] text-neutral-200 text-sm font-sans border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 placeholder-neutral-600 transition-all"
        style={{
          borderColor: `${phaseColor}33`,
          ['--tw-ring-color' as string]: `${phaseColor}66`,
        }}
      />
    </label>
  );
}

function NumField({
  phaseColor, label, value, onChange,
}: { phaseColor: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-white/[0.03] text-neutral-200 text-sm font-mono tabular-nums border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 placeholder-neutral-600 transition-all"
        style={{
          borderColor: `${phaseColor}33`,
          ['--tw-ring-color' as string]: `${phaseColor}66`,
        }}
      />
    </label>
  );
}

function Stat({ phaseColor, label, value, icon }: { phaseColor: string; label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ backgroundColor: `${phaseColor}0d`, borderColor: `${phaseColor}33` }}
    >
      <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-sm font-bold tabular-nums inline-flex items-center gap-1" style={{ color: phaseColor }}>
        {icon}
        {value}
      </div>
    </div>
  );
}

function Excerpt({ phaseColor, label, text }: { phaseColor: string; label: string; text: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: `${phaseColor}22` }}
    >
      <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</div>
      <p className="text-[12px] text-neutral-300 font-sans whitespace-pre-wrap">{text}</p>
    </div>
  );
}
