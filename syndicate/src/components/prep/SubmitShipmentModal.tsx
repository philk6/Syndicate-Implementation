'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Loader2, ArrowLeft, ArrowRight, Send, Upload } from 'lucide-react';
import { PREP_GOLD, DOC_TYPES } from './prepTheme';
import { createShipment, uploadDocument, type PrepItemInput } from '@/lib/actions/prep';

interface SubmitShipmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: () => void;
}

type Step = 1 | 2 | 3;

export function SubmitShipmentModal({ open, onOpenChange, userId, onCreated }: SubmitShipmentModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplier, setSupplier] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [tracking, setTracking] = useState('');
  const [eta, setEta] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  const [items, setItems] = useState<PrepItemInput[]>([
    { product_name: '', asin: '', fnsku: '', units_expected: 0, prep_type: 'fnsku_label' },
  ]);

  const [pendingDocs, setPendingDocs] = useState<Array<{ file: File; type: string }>>([]);

  const reset = () => {
    setStep(1); setError(null); setSupplier(''); setPoNumber(''); setTracking('');
    setEta(''); setClientNotes('');
    setItems([{ product_name: '', asin: '', fnsku: '', units_expected: 0, prep_type: 'fnsku_label' }]);
    setPendingDocs([]);
  };

  const canStep1 = supplier.trim().length > 0;
  const canStep2 = items.some((i) => i.product_name.trim().length > 0 && (i.units_expected ?? 0) > 0);

  const handleSubmit = async () => {
    setSubmitting(true); setError(null);
    try {
      const cleanedItems = items
        .filter((i) => i.product_name.trim().length > 0)
        .map((i) => ({
          product_name: i.product_name.trim(),
          asin: i.asin?.trim() || null,
          fnsku: i.fnsku?.trim() || null,
          units_expected: Math.max(0, Number(i.units_expected) || 0),
          prep_type: i.prep_type || null,
        }));

      const shipment = await createShipment(userId, {
        supplier_name: supplier.trim(),
        po_number: poNumber.trim() || null,
        tracking_number: tracking.trim() || null,
        estimated_arrival: eta || null,
        client_notes: clientNotes.trim() || null,
      }, cleanedItems);

      // Best-effort upload of pending docs (parallel)
      await Promise.all(pendingDocs.map(async ({ file, type }) => {
        const b64 = await fileToBase64(file);
        try {
          await uploadDocument({
            userId, shipmentId: shipment.id, documentType: type,
            fileName: file.name, fileBase64: b64, fileMime: file.type, fileSize: file.size,
          });
        } catch (err) {
          console.warn('Doc upload failed for', file.name, err);
        }
      }));

      reset();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-[#0a0a0a]/95 border border-white/[0.08] backdrop-blur-xl text-white max-w-2xl rounded-2xl font-mono">
        <DialogHeader>
          <DialogTitle className="text-white text-base font-black uppercase tracking-widest">
            Submit New Shipment · Step {step}/3
          </DialogTitle>
          <DialogDescription className="text-neutral-500 text-xs">
            {step === 1 && 'Basic shipment info — supplier, tracking, arrival'}
            {step === 2 && 'Products being shipped'}
            {step === 3 && 'Optional documents — PO, invoice, BOL'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 h-1 rounded-full"
              style={{ backgroundColor: n <= step ? PREP_GOLD : 'rgba(255,255,255,0.08)',
                       boxShadow: n === step ? `0 0 8px ${PREP_GOLD}` : 'none' }} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <TxtField label="Supplier name *" value={supplier} onChange={setSupplier} placeholder="ABC Wholesale Inc." />
            <div className="grid grid-cols-2 gap-3">
              <TxtField label="PO number" value={poNumber} onChange={setPoNumber} />
              <TxtField label="Tracking number" value={tracking} onChange={setTracking} />
            </div>
            <DateField label="Estimated arrival" value={eta} onChange={setEta} />
            <TextAreaField label="Client notes" value={clientNotes} onChange={setClientNotes} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Product #{idx + 1}</span>
                  {items.length > 1 && (
                    <button onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="ml-auto text-neutral-500 hover:text-red-400 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <TxtField label="Product name *" value={it.product_name}
                  onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, product_name: v } : x))} />
                <div className="grid grid-cols-3 gap-2">
                  <TxtField label="ASIN" value={it.asin ?? ''}
                    onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, asin: v } : x))} />
                  <TxtField label="FNSKU" value={it.fnsku ?? ''}
                    onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, fnsku: v } : x))} />
                  <NumField label="Expected units *" value={String(it.units_expected ?? '')}
                    onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, units_expected: Number(v) } : x))} />
                </div>
                <SelField
                  label="Prep type"
                  value={it.prep_type ?? ''}
                  onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, prep_type: v } : x))}
                  options={[
                    { value: '', label: '— None —' },
                    { value: 'fnsku_label', label: 'FNSKU Label' },
                    { value: 'poly_bag', label: 'Poly Bag' },
                    { value: 'bubble_wrap', label: 'Bubble Wrap' },
                    { value: 'bundle', label: 'Bundle' },
                    { value: 'oversize', label: 'Oversize Handling' },
                  ]}
                />
              </div>
            ))}
            <button
              onClick={() => setItems([...items, { product_name: '', asin: '', fnsku: '', units_expected: 0, prep_type: '' }])}
              className="w-full py-2 rounded-lg border border-dashed text-[11px] font-bold font-mono uppercase tracking-widest cursor-pointer"
              style={{ borderColor: `${PREP_GOLD}55`, color: PREP_GOLD }}
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" /> Add product
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-400">Upload any supporting docs. All optional — you can also add them later from the shipment detail.</p>
            <ul className="space-y-1.5">
              {pendingDocs.map((d, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <Upload className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="flex-1 text-xs truncate">{d.file.name}</span>
                  <select
                    value={d.type}
                    onChange={(e) => setPendingDocs(pendingDocs.map((x, idx) => idx === i ? { ...x, type: e.target.value } : x))}
                    className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-0.5 text-[10px]"
                  >
                    {DOC_TYPES.map((d2) => <option key={d2.value} value={d2.value}>{d2.label}</option>)}
                  </select>
                  <button onClick={() => setPendingDocs(pendingDocs.filter((_, idx) => idx !== i))}
                    className="text-neutral-500 hover:text-red-400 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <label
              className="flex items-center justify-center gap-2 py-6 rounded-lg border border-dashed cursor-pointer text-xs font-mono uppercase tracking-widest"
              style={{ borderColor: `${PREP_GOLD}55`, color: PREP_GOLD }}
            >
              <Upload className="w-4 h-4" />
              Drag or click to attach file
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPendingDocs([...pendingDocs, ...files.map((f) => ({ file: f, type: 'purchase_order' }))]);
                }}
              />
            </label>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)}
              className="text-neutral-400 hover:text-white hover:bg-white/[0.05]">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={(step === 1 && !canStep1) || (step === 2 && !canStep2)}
              className="bg-[#FFD70026] border border-[#FFD700] text-[#FFD700] hover:bg-[#FFD70044] disabled:opacity-40"
            >
              Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-[#FFD700] text-black font-bold uppercase tracking-widest hover:bg-[#FFD700]/90"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Submit Shipment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inputs ──────────────────────────────────────────────────────────────────

function TxtField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/[0.03] text-neutral-200 text-sm font-sans border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD70066] placeholder-neutral-600" />
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] text-neutral-200 text-sm font-mono tabular-nums border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD70066]" />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] text-neutral-200 text-sm font-mono border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD70066]" />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</span>
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none bg-white/[0.03] text-neutral-200 text-sm font-sans border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD70066]" />
    </label>
  );
}

function SelField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] text-neutral-200 text-sm font-sans border border-white/[0.08] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FFD70066]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string) ?? '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
