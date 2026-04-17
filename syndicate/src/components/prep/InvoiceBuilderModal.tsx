'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Loader2, Send, Receipt } from 'lucide-react';
import { PREP_GOLD, INVOICE_QUICK_ADDS } from './prepTheme';
import { createInvoice, type InvoiceLineInput } from '@/lib/actions/prep';

interface InvoiceBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminUserId: string;
  shipmentId: number | null;
  supplierName?: string | null;
  receivedUnits?: number | null;
  onCreated: () => void;
}

export function InvoiceBuilderModal({
  open, onOpenChange, adminUserId, shipmentId, supplierName, receivedUnits, onCreated,
}: InvoiceBuilderModalProps) {
  const [lines, setLines] = useState<InvoiceLineInput[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setLines([]); setDueDate(''); setNotes(''); setError(null); };

  const subtotal = lines.reduce((s, li) => s + li.quantity * li.unit_price, 0);

  const addQuick = (description: string, unit_price: number) => {
    setLines([...lines, { description, quantity: receivedUnits && receivedUnits > 0 ? receivedUnits : 1, unit_price }]);
  };

  const handleSubmit = async () => {
    if (!shipmentId) return;
    if (lines.length === 0) { setError('Add at least one line item'); return; }
    setSubmitting(true); setError(null);
    try {
      await createInvoice(adminUserId, shipmentId, lines, { dueDate: dueDate || null, notes: notes || null });
      reset(); onCreated(); onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-[#0a0a0a]/95 border border-white/[0.08] backdrop-blur-xl text-white max-w-2xl rounded-2xl font-mono max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-black uppercase tracking-widest">
            <Receipt className="w-4 h-4 inline mr-1.5" style={{ color: PREP_GOLD }} />
            Invoice Builder
          </DialogTitle>
          <DialogDescription className="text-neutral-500 text-xs">
            Shipment #{shipmentId}{supplierName ? ` · ${supplierName}` : ''}
            {receivedUnits != null ? ` · ${receivedUnits} units received` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick-adds */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Quick-add line items</p>
            <div className="flex flex-wrap gap-1.5">
              {INVOICE_QUICK_ADDS.map((q) => (
                <button
                  key={q.description}
                  onClick={() => addQuick(q.description, q.unit_price)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border cursor-pointer transition-colors hover:brightness-125"
                  style={{ backgroundColor: `${PREP_GOLD}1a`, borderColor: `${PREP_GOLD}66`, color: PREP_GOLD }}
                >
                  + {q.description} · ${q.unit_price.toFixed(2)}
                </button>
              ))}
              <button
                onClick={() => setLines([...lines, { description: '', quantity: 1, unit_price: 0 }])}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border cursor-pointer"
                style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#a3a3a3' }}
              >
                <Plus className="w-3 h-3 inline mr-0.5" /> Custom
              </button>
            </div>
          </div>

          {/* Lines */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Line items</p>
            {lines.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">No items yet — use a quick-add or Custom.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((li, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                    <input
                      placeholder="Description"
                      value={li.description}
                      onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))}
                      className="col-span-6 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs focus:outline-none"
                    />
                    <input
                      type="number" min={1}
                      placeholder="Qty"
                      value={li.quantity}
                      onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 0) } : x))}
                      className="col-span-2 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs tabular-nums focus:outline-none"
                    />
                    <input
                      type="number" step="0.01" min={0}
                      placeholder="Unit $"
                      value={li.unit_price}
                      onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, unit_price: Math.max(0, Number(e.target.value) || 0) } : x))}
                      className="col-span-2 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs tabular-nums focus:outline-none"
                    />
                    <span className="col-span-1 text-xs tabular-nums text-right" style={{ color: PREP_GOLD }}>
                      ${(li.quantity * li.unit_price).toFixed(2)}
                    </span>
                    <button
                      onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                      className="col-span-1 text-neutral-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals + meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FFD70066]" />
            </label>
            <div className="text-right self-end">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Subtotal</div>
              <div className="text-2xl font-black tabular-nums" style={{ color: PREP_GOLD, textShadow: `0 0 10px ${PREP_GOLD}66` }}>
                ${subtotal.toFixed(2)}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Notes (optional)</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#FFD70066]" />
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-neutral-400 hover:text-white hover:bg-white/[0.05]">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || lines.length === 0}
            className="bg-[#FFD700] text-black font-bold uppercase tracking-widest hover:bg-[#FFD700]/90 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Send Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
