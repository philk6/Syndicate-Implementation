'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileText, Loader2, X } from 'lucide-react';
import { PREP_GOLD, DOC_TYPES, STATUS_COLOR, type PrepStatus } from './prepTheme';
import { StatusBadge } from './StatusBadge';
import { ShipmentTimeline } from './ShipmentTimeline';
import {
  getShipmentDetail, uploadDocument, getSignedDocumentUrl, markInvoicePaid,
} from '@/lib/actions/prep';

interface ShipmentDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  shipmentId: number | null;
  onChange: () => void;
}

type DetailShape = {
  id: number;
  supplier_name: string;
  po_number: string | null;
  tracking_number: string | null;
  estimated_arrival: string | null;
  status: PrepStatus;
  unit_count_expected: number | null;
  unit_count_received: number | null;
  warehouse_notes: string | null;
  client_notes: string | null;
  amazon_shipment_id: string | null;
  items: Array<{ id: number; product_name: string; asin: string | null; fnsku: string | null;
    units_expected: number; units_received: number; units_damaged: number; prep_type: string | null }>;
  documents: Array<{ id: number; document_type: string; file_name: string; file_url: string; created_at: string }>;
  invoices: Array<{ id: number; invoice_number: string; status: string; total: number; due_date: string | null;
    paid_at: string | null; line_items: Array<{ description: string; quantity: number; unit_price: number; total: number }> }>;
  [k: string]: unknown;
};

export function ShipmentDetailDrawer({ open, onOpenChange, userId, shipmentId, onChange }: ShipmentDetailDrawerProps) {
  const [shipment, setShipment] = useState<DetailShape | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('purchase_order');

  const reload = async () => {
    if (!shipmentId) return;
    setLoading(true);
    try {
      const s = await getShipmentDetail(userId, shipmentId);
      setShipment(s as DetailShape);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open && shipmentId) reload(); }, [open, shipmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (file: File) => {
    if (!shipmentId) return;
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      await uploadDocument({
        userId, shipmentId, documentType: docType,
        fileName: file.name, fileBase64: b64, fileMime: file.type, fileSize: file.size,
      });
      await reload();
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const url = await getSignedDocumentUrl(path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleMarkPaid = async (invoiceId: number) => {
    if (!confirm('Mark this invoice as paid?')) return;
    try {
      await markInvoicePaid(userId, invoiceId);
      await reload();
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a]/95 border border-white/[0.08] backdrop-blur-xl text-white max-w-4xl rounded-2xl max-h-[92vh] overflow-y-auto font-mono">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-black uppercase tracking-wider flex items-center gap-2">
            <span>Shipment #{shipmentId}</span>
            {shipment && <StatusBadge status={shipment.status} size="md" />}
          </DialogTitle>
          <DialogDescription className="text-neutral-500 text-xs">
            {shipment?.supplier_name ?? '…'}
            {shipment?.po_number ? ` · PO ${shipment.po_number}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading || !shipment ? (
          <div className="py-10 text-center text-neutral-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading shipment…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Timeline */}
            <Section title="Timeline">
              <ShipmentTimeline shipment={shipment as Record<string, unknown> & { status: PrepStatus }} />
            </Section>

            {/* Meta */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Meta label="Tracking" value={shipment.tracking_number} />
              <Meta label="ETA" value={shipment.estimated_arrival} />
              <Meta label="Expected" value={shipment.unit_count_expected ?? '—'} />
              <Meta label="Received" value={shipment.unit_count_received ?? '—'} />
            </div>

            {/* Items */}
            <Section title="Products">
              {shipment.items.length === 0 ? (
                <p className="text-xs text-neutral-500">No products in this shipment yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-neutral-500 border-b border-white/[0.08]">
                        <th className="text-left py-2 px-3">Product</th>
                        <th className="text-left py-2 px-3">ASIN</th>
                        <th className="text-left py-2 px-3">FNSKU</th>
                        <th className="text-right py-2 px-3">Exp</th>
                        <th className="text-right py-2 px-3">Rec</th>
                        <th className="text-right py-2 px-3">Dmg</th>
                        <th className="text-left py-2 px-3">Prep</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.items.map((i) => (
                        <tr key={i.id} className="border-b border-white/[0.03]">
                          <td className="py-2 px-3 text-neutral-200">{i.product_name}</td>
                          <td className="py-2 px-3 text-neutral-400">{i.asin ?? '—'}</td>
                          <td className="py-2 px-3 text-neutral-400">{i.fnsku ?? '—'}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{i.units_expected}</td>
                          <td className="py-2 px-3 text-right tabular-nums" style={{ color: PREP_GOLD }}>{i.units_received}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-400">{i.units_damaged}</td>
                          <td className="py-2 px-3 text-neutral-400">{i.prep_type ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Documents */}
            <Section title="Documents">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <select value={docType} onChange={(e) => setDocType(e.target.value)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none">
                  {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <label
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold font-mono uppercase tracking-widest border cursor-pointer"
                  style={{ backgroundColor: `${PREP_GOLD}1a`, borderColor: PREP_GOLD, color: PREP_GOLD }}
                >
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                  />
                </label>
              </div>
              {shipment.documents.length === 0 ? (
                <p className="text-xs text-neutral-500">No documents uploaded yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {shipment.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.05] bg-white/[0.02]">
                      <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="flex-1 text-xs text-neutral-200 truncate">{d.file_name}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">{d.document_type.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-neutral-500">{new Date(d.created_at).toLocaleDateString()}</span>
                      <button onClick={() => handleDownload(d.file_url)} className="text-neutral-400 hover:text-[#FFD700] transition-colors cursor-pointer">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Warehouse notes */}
            {shipment.warehouse_notes && (
              <Section title="Notes from Warehouse">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-neutral-300 whitespace-pre-wrap font-sans">
                  {shipment.warehouse_notes}
                </div>
              </Section>
            )}

            {/* Invoices */}
            {shipment.invoices.length > 0 && (
              <Section title="Invoices">
                {shipment.invoices.map((inv) => (
                  <div key={inv.id} className="rounded-lg border px-4 py-3 mb-2"
                    style={{ borderColor: `${STATUS_COLOR.complete}55`, backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{inv.invoice_number}</span>
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: inv.status === 'paid' ? '#22C55E' : '#EAB308' }}>{inv.status}</span>
                      <span className="ml-auto text-sm font-bold" style={{ color: PREP_GOLD }}>${Number(inv.total).toFixed(2)}</span>
                    </div>
                    {inv.line_items.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[11px] text-neutral-400">
                        {inv.line_items.map((li, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span>{li.description} × {li.quantity}</span>
                            <span className="tabular-nums">${Number(li.total).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <button
                        onClick={() => handleMarkPaid(inv.id)}
                        className="mt-2 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border cursor-pointer"
                        style={{ borderColor: '#22C55E', color: '#22C55E', backgroundColor: '#22C55E1a' }}
                      >
                        Mark as Paid
                      </button>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* Close */}
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-neutral-400 hover:text-white hover:bg-white/[0.05]">
                <X className="w-4 h-4 mr-1" /> Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500 mb-2 flex items-center gap-2">
        <span className="w-4 h-px bg-neutral-700" />
        {title}
        <span className="flex-1 h-px bg-neutral-800" />
      </h3>
      {children}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-xs font-bold text-neutral-200 tabular-nums">{value ?? '—'}</div>
    </div>
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
