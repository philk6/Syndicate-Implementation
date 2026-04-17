'use client';

import { STATUS_COLOR, STATUS_LABEL, type PrepStatus } from './prepTheme';

export function StatusBadge({ status, size = 'sm' }: { status: PrepStatus; size?: 'sm' | 'md' }) {
  const color = STATUS_COLOR[status];
  const pad = size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-bold font-mono uppercase tracking-wider border ${pad}`}
      style={{
        backgroundColor: `${color}22`,
        borderColor: `${color}66`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
