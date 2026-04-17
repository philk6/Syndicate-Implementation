'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@lib/supabase/client';
import { Calendar, Users } from 'lucide-react';
import { getCurrentWeekStart } from '@/lib/weeklyCheckin';

interface CheckinRow {
  id: number;
  user_id: string;
  company_id: number | null;
  suppliers_contacted: number;
  calls_made: number;
  submitted_at: string;
  accomplished: string;
  next_week_goal: string;
  users: { firstname: string | null; lastname: string | null; email: string } | null;
  company: { name: string } | null;
}

export function AdminWeeklyCheckIns() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const weekStart = getCurrentWeekStart();

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [checkinsRes, userCountRes] = await Promise.all([
          supabase
            .from('weekly_checkins')
            .select(
              'id, user_id, company_id, suppliers_contacted, calls_made, submitted_at, accomplished, next_week_goal, users!weekly_checkins_user_id_fkey(firstname, lastname, email), company:company_id(name)',
            )
            .eq('week_start', weekStart)
            .order('submitted_at', { ascending: false }),
          supabase.from('users').select('user_id', { count: 'exact', head: true }).neq('role', 'admin'),
        ]);
        if (cancel) return;
        setRows((checkinsRes.data ?? []) as unknown as CheckinRow[]);
        setTotalStudents(userCountRes.count ?? 0);
      } catch (err) {
        console.error('Failed to load admin check-ins:', err);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [weekStart]);

  const color = '#FFD700';

  return (
    <div
      className="relative rounded-2xl border  p-6 overflow-hidden font-mono"
      style={{ borderColor: `${color}55`, backgroundColor: 'rgba(10,10,15,0.6)', boxShadow: `0 0 24px ${color}22` }}
    >
      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }} />

      <div className="pl-2 flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}1a`, borderColor: `${color}66`, color }}
        >
          <Calendar className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color }}>
            Weekly Check-Ins · Week of {weekStart}
          </p>
          <h3 className="text-lg font-black text-white uppercase tracking-wider">
            Student Activity Log
          </h3>
        </div>
        <div
          className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold"
          style={{ backgroundColor: `${color}10`, borderColor: `${color}44`, color }}
        >
          <Users className="w-3.5 h-3.5" />
          <span className="tabular-nums">{rows.length}</span>
          <span className="text-neutral-500">/</span>
          <span className="tabular-nums text-neutral-400">{totalStudents}</span>
          <span className="text-[9px] uppercase tracking-widest ml-1 text-neutral-500">checked in</span>
        </div>
      </div>

      {loading ? (
        <p className="pl-2 text-xs text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="pl-2 text-xs text-neutral-500">No check-ins yet this week.</p>
      ) : (
        <div className="pl-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-neutral-500 border-b border-white/[0.05]">
                <th className="text-left font-bold py-2 px-2">Student</th>
                <th className="text-left font-bold py-2 px-2">Company</th>
                <th className="text-right font-bold py-2 px-2">Suppliers</th>
                <th className="text-right font-bold py-2 px-2">Calls</th>
                <th className="text-right font-bold py-2 px-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name =
                  [r.users?.firstname, r.users?.lastname].filter(Boolean).join(' ') || r.users?.email || '—';
                return (
                  <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-2 text-neutral-200">{name}</td>
                    <td className="py-2.5 px-2 text-neutral-400">{r.company?.name ?? '—'}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-neutral-200">{r.suppliers_contacted}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-neutral-200">{r.calls_made}</td>
                    <td className="py-2.5 px-2 text-right text-neutral-500 tabular-nums">
                      {new Date(r.submitted_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
