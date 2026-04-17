'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Save, Download, FileText, Receipt } from 'lucide-react';
import { PREP_GOLD, DOC_TYPES, STATUS_LABEL, type PrepStatus } from './prepTheme';
import { StatusBadge } from './StatusBadge';
import { ShipmentTimeline } from './ShipmentTimeline';
import { InvoiceBuilderModal } from './InvoiceBuilderModal';
import {
  getShipmentDetail, updateShipmentStatus, updateReceivedUnits,
  updateShipmentItem, uploadWarehouseDocument, getSignedDocumentUrl,
  createNotification,
} from '@/lib/actions/prep';

interface AdminShipmentManagementDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminUserId: string;
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
  user_id: string;
  items: Array<{ id: number; product_name: string; asin: string | null; fnsku: string | null;
    units_expected: number; units_received: number; units_damaged: number; prep_type: string | null }>;
  documents: Array<{ id: number; document_type: string; file_name: string; file_url: string; created_at: string }>;
  invoices: Array<{ id: number; invoice_number: string; status: string; total: number }>;
  owner: { firstname: string | null; lastname: string | null; email: string } | null;
  company: { name: string } | null;
  [k: string]: unknown;
};

export function AdminShipmentManagementDrawer({
  open, onOpenChange, adminUserId, shipmentId, onChange,
}: AdminShipmentManagementDrawerProps) {
  const [shipment, setShipment] = useState<DetailShape | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>('receiving_photo');
  const [pendingStatus, setPendingStatus] = useState<PrepStatus | ''>('');
  const [pendingNotes, setPendingNotes] = useState('');
  const [unitsReceived, setUnitsReceived] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const reload = async () => {
    if (!shipmentId) return;
    setLoading(true);
    try {
      const s = await getShipmentDetail(adminUserId, shipmentId) as DetailShape;
      setShipment(s);
      setPendingStatus(s.status);
      setPendingNotes(s.warehouse_notes ?? '');
      setUnitsReceived(s.unit_count_received != null ? String(s.unit_count_received) : '');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open && shipmentId) reload(); }, [open, shipmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitStatus = async () => {
    if (!shipmentId || !pendingStatus) return;
    await updateShipmentStatus(adminUserId, shipmentId, pendingStatus as PrepStatus, pendingNotes || null);
    await reload(); onChange();
  };

  const commitUnits = async () => {
    if (!shipmentId) return;
    await updateReceivedUnits(adminUserId, shipmentId, Number(unitsReceived) || 0);
    await reload(); onChange();
  };

  const updateItem = async (
    itemId: number,
    patch: { units_received?: number; units_damaged?: number; prep_type?: string | null; notes?: string | null },
  ) => {
    await updateShipmentItem(adminUserId, itemId, patch);
    await reload();
  };

  const handleUpload = async (file: File) => {
    if (!shipmentId) return;
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      await uploadWarehouseDocument({
        adminUserId, shipmentId, documentType: docType,
        fileName: file.name, fileBase64: b64, fileMime: file.type, fileSize: file.size,
      });
      await reload(); onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally { setUploading(false); }
  };

  const sendMessage = async () => {
    if (!shipment || !messageText.trim()) return;
    try {
      await createNotification(adminUserId, shipment.user_id, shipment.id, 'warehouse_message', messageText.trim());
      setMessageText('');
      alert('Message sent to client');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDownload = async (path: string) => {
    try { const url = await getSignedDocumentUrl(path); window.open(url, '_blank', 'noopener'); }
    catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[#0a0a0a]/95 border border-white/[0.08] backdrop-blur-xl text-white max-w-5xl rounded-2xl max-h-[92vh] overflow-y-auto font-mono">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-black uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>Shipment #{shipmentId}</span>
              {shipment && <StatusBadge status={shipment.status} size="md" />}
              <span className="ml-auto text-[10px] uppercase tracking-widest text-neutral-500">ADMIN</span>
            </DialogTitle>
            {shipment && (
              <DialogDescription className="text-neutral-500 text-xs">
                {shipment.supplier_name}
                {' · '}
                {[shipment.owner?.firstname, shipment.owner?.lastname].filter(Boolean).join(' ') || shipment.owner?.email}
                {shipment.company?.name ? ` · ${shipment.company.name}` : ''}
              </DialogDescription>
            )}
          </DialogHeader>

          {loading || !shipment ? (
            <div className="py-10 text-center text-neutral-500 text-xs">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
            </div>
          ) : (
            <div className="space-y-5">
              {/* Timeline */}
              <Section title="Timeline">
                <ShipmentTimeline shipment={shipment as Record<string, unknown> & { status: PrepStatus }} />
              </Section>

              {/* Status + units control */}
              <Section title="Status Control">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">New status</label>
                    <select value={pendingStatus} onChange={(e) => setPendingStatus(e.target.value as PrepStatus)}
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none">
                      {(Object.keys(STATUS_LABEL) as PrepStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Units received</label>
                    <div className="flex gap-2">
                      <input type="number" min={0} value={unitsReceived} onChange={(e) => setUnitsReceived(e.target.value)}
                        className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs tabular-nums focus:outline-none" />
                      <button onClick={commitUnits}
                        className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border cursor-pointer"
                        style={{ backgroundColor: `${PREP_GOLD}1a`, borderColor: PREP_GOLD, color: PREP_GOLD }}>
                        <Save className="w-3.5 h-3.5 inline mr-1" /> Save
                      </button>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Warehouse notes (visible to client)</label>
                    <textarea rows={2} value={pendingNotes} onChange={(e) => setPendingNotes(e.target.value)}
                      className="w-full resize-none bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-sans focus:outline-none" />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <button onClick={commitStatus}
                      className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest cursor-pointer"
                      style={{ backgroundColor: PREP_GOLD, color: '#0a0a0a', boxShadow: `0 0 14px ${PREP_GOLD}55` }}>
                      Update Status
                    </button>
                  </div>
                </div>
              </Section>

              {/* Items admin edit */}
              <Section title="Products">
                <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-neutral-500 border-b border-white/[0.08]">
                        <th className="text-left py-2 px-3">Product</th>
                        <th className="text-right py-2 px-3">Exp</th>
                        <th className="text-right py-2 px-3">Received</th>
                        <th className="text-right py-2 px-3">Damaged</th>
                        <th className="text-left py-2 px-3">Prep</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.items.map((i) => (
                        <tr key={i.id} className="border-b border-white/[0.03]">
                          <td className="py-2 px-3 text-neutral-200">
                            {i.product_name}
                            <div className="text-[10px] text-neutral-500">
                              {i.asin ?? '—'} · {i.fnsku ?? '—'}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">{i.units_expected}</td>
                          <td className="py-2 px-3 text-right">
                            <input type="number" min={0} defaultValue={i.units_received}
                              onBlur={(e) => updateItem(i.id, { units_received: Number(e.target.value) || 0 })}
                              className="w-20 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs tabular-nums text-right" />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input type="number" min={0} defaultValue={i.units_damaged}
                              onBlur={(e) => updateItem(i.id, { units_damaged: Number(e.target.value) || 0 })}
                              className="w-20 bg-white/[0.03] border border-white/[0.06] rounded px-2 py-1 text-xs tabular-nums text-right" />
                          </td>
                          <td className="py-2 px-3 text-neutral-400">{i.prep_type ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Document upload */}
              <Section title="Documents">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <select value={docType} onChange={(e) => setDocType(e.target.value)}
                    className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs">
                    {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <label
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest border cursor-pointer"
                    style={{ backgroundColor: `${PREP_GOLD}1a`, borderColor: PREP_GOLD, color: PREP_GOLD }}
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Upload
                    <input type="file" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                  </label>
                </div>
                {shipment.documents.length === 0 ? (
                  <p className="text-xs text-neutral-500">No documents.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {shipment.documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.05] bg-white/[0.02]">
                        <FileText className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="flex-1 text-xs text-neutral-200 truncate">{d.file_name}</span>
                        <span className="text-[10px] uppercase tracking-wider text-neutral-500">{d.document_type.replace(/_/g, ' ')}</span>
                        <button onClick={() => handleDownload(d.file_url)} className="text-neutral-400 hover:text-[#FFD700] cursor-pointer">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Send message */}
              <Section title="Send Message to Client">
                <div className="flex gap-2">
                  <input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Quick note to the client…"
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                  <button onClick={sendMessage} disabled={!messageText.trim()}
                    className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border cursor-pointer disabled:opacity-40"
                    style={{ backgroundColor: `${PREP_GOLD}1a`, borderColor: PREP_GOLD, color: PREP_GOLD }}>
                    Send
                  </button>
                </div>
              </Section>

              {/* Invoice builder trigger */}
              <Section title="Invoice">
                {shipment.invoices.length > 0 ? (
                  <div className="space-y-2">
                    {shipment.invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 px-4 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                        <span className="text-xs font-bold">{inv.invoice_number}</span>
                        <span className="text-[10px] uppercase tracking-widest">{inv.status}</span>
                        <span className="tabular-nums text-sm font-bold" style={{ color: PREP_GOLD }}>${Number(inv.total).toFixed(2)}</span>
                      </div>
                    ))}
                    <button onClick={() => setInvoiceOpen(true)}
                      className="w-full py-2 rounded-lg border border-dashed text-[10px] uppercase tracking-widest font-bold cursor-pointer"
                      style={{ borderColor: `${PREP_GOLD}55`, color: PREP_GOLD }}>
                      <Receipt className="w-3.5 h-3.5 inline mr-1" /> Add another invoice
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setInvoiceOpen(true)}
                    className="w-full py-3 rounded-lg border text-xs uppercase tracking-widest font-bold cursor-pointer"
                    style={{ backgroundColor: `${PREP_GOLD}1a`, borderColor: PREP_GOLD, color: PREP_GOLD }}>
                    <Receipt className="w-4 h-4 inline mr-1.5" /> Create Invoice
                  </button>
                )}
              </Section>

              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-neutral-400 hover:text-white hover:bg-white/[0.05]">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InvoiceBuilderModal
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        adminUserId={adminUserId}
        shipmentId={shipmentId}
        supplierName={shipment?.supplier_name ?? null}
        receivedUnits={shipment?.unit_count_received ?? null}
        onCreated={() => { reload(); onChange(); }}
      />
    </>
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string) ?? '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
