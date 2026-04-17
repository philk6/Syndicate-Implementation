'use client';

import { STATUS_COLOR, STATUS_FLOW, STATUS_LABEL, STATUS_COL, type PrepStatus } from './prepTheme';
import { Check, X, Clock } from 'lucide-react';

interface ShipmentTimelineProps {
  shipment: Record<string, unknown> & { status: PrepStatus };
}

function formatAt(ts: unknown): string | null {
  if (!ts || typeof ts !== 'string') return null;
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return null; }
}

export function ShipmentTimeline({ shipment }: ShipmentTimelineProps) {
  const cur = shipment.status as PrepStatus;
  if (cur === 'cancelled') {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
        <X className="w-4 h-4 inline mr-1.5 text-neutral-500" />
        <span className="text-xs font-mono uppercase tracking-widest text-neutral-400">
          Shipment cancelled{formatAt(shipment.cancelled_at) ? ` · ${formatAt(shipment.cancelled_at)}` : ''}
        </span>
      </div>
    );
  }

  const reachedIdx = STATUS_FLOW.indexOf(cur);

  return (
    <div className="relative">
      {/* base rail */}
      <div className="absolute top-3 left-3 right-3 h-0.5 bg-white/[0.06]" />
      {/* progress rail */}
      <div
        className="absolute top-3 left-3 h-0.5 transition-all duration-500"
        style={{
          width: `calc((100% - 1.5rem) * ${Math.max(0, reachedIdx) / (STATUS_FLOW.length - 1)})`,
          backgroundColor: STATUS_COLOR[cur],
          boxShadow: `0 0 10px ${STATUS_COLOR[cur]}88`,
        }}
      />

      <ol className="relative grid grid-cols-6 gap-1">
        {STATUS_FLOW.map((s, i) => {
          const reached = i <= reachedIdx;
          const isCurrent = s === cur;
          const color = STATUS_COLOR[s];
          const stamp = formatAt(shipment[STATUS_COL[s] as string]);
          return (
            <li key={s} className="flex flex-col items-center">
              <div
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center relative z-10 transition-all"
                style={{
                  backgroundColor: reached ? color : '#0a0a0a',
                  borderColor: reached ? color : 'rgba(255,255,255,0.15)',
                  boxShadow: isCurrent ? `0 0 14px ${color}` : 'none',
                }}
              >
                {reached ? (
                  <Check className="w-3 h-3 text-black" strokeWidth={3} />
                ) : (
                  <Clock className="w-3 h-3 text-neutral-600" />
                )}
              </div>
              <span
                className="text-[9px] font-bold font-mono uppercase tracking-wider mt-1.5 text-center"
                style={{ color: reached ? color : 'rgba(255,255,255,0.35)' }}
              >
                {STATUS_LABEL[s]}
              </span>
              <span className="text-[9px] text-neutral-500 tabular-nums mt-0.5 text-center min-h-[1em]">
                {stamp ?? ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
