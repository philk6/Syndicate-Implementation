'use client';

import { Calendar, Package, Hash, Clock } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { PREP_GOLD, type PrepStatus } from './prepTheme';

export interface ShipmentCardProps {
  shipment: {
    id: number;
    supplier_name: string;
    po_number: string | null;
    tracking_number: string | null;
    status: PrepStatus;
    estimated_arrival: string | null;
    unit_count_expected: number | null;
    unit_count_received: number | null;
    updated_at: string;
  };
  onView: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
}

export function ShipmentCard({ shipment, onView, onEdit, onCancel }: ShipmentCardProps) {
  const editable = shipment.status === 'submitted';
  return (
    <div
      className="relative rounded-2xl border  p-5 transition-all hover:bg-white/[0.02] cursor-pointer overflow-hidden"
      style={{ borderColor: `${PREP_GOLD}33`, backgroundColor: 'rgba(10,10,15,0.6)' }}
      onClick={onView}
    >
      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: PREP_GOLD, boxShadow: `0 0 12px ${PREP_GOLD}` }} />

      <div className="pl-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Package className="w-3.5 h-3.5" style={{ color: PREP_GOLD }} />
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white truncate">
              {shipment.supplier_name}
            </h3>
            <StatusBadge status={shipment.status} />
          </div>

          <div className="flex items-center gap-4 flex-wrap text-[11px] text-neutral-400 font-mono">
            {shipment.po_number && (
              <span className="inline-flex items-center gap-1">
                <Hash className="w-3 h-3" /> PO: {shipment.po_number}
              </span>
            )}
            {shipment.estimated_arrival && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" /> ETA: {shipment.estimated_arrival}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> Updated {new Date(shipment.updated_at).toLocaleDateString()}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-4 text-[11px] font-mono">
            <Stat label="Expected" value={shipment.unit_count_expected ?? '—'} />
            <Stat label="Received" value={shipment.unit_count_received ?? '—'} color={shipment.unit_count_received != null ? PREP_GOLD : undefined} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {editable && onEdit && <PillBtn color={PREP_GOLD} onClick={onEdit}>Edit</PillBtn>}
          {editable && onCancel && <PillBtn color="#EF4444" onClick={onCancel}>Cancel</PillBtn>}
          <PillBtn color={PREP_GOLD} onClick={onView} solid>View Details</PillBtn>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">{label}</span>
      <span className="tabular-nums font-bold" style={{ color: color ?? '#e5e5e5' }}>{value}</span>
    </span>
  );
}

function PillBtn({
  color, onClick, children, solid,
}: { color: string; onClick: () => void; children: React.ReactNode; solid?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg border text-[10px] font-bold font-mono uppercase tracking-widest transition-colors cursor-pointer"
      style={{
        backgroundColor: solid ? color : `${color}1a`,
        borderColor: solid ? color : `${color}55`,
        color: solid ? '#0a0a0a' : color,
      }}
    >
      {children}
    </button>
  );
}
