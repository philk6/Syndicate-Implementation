'use server';

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Service-role client (bypasses RLS — server-only)
// ---------------------------------------------------------------------------
const getSupabaseService = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
};

async function verifyAdmin(userId: string) {
  const supabase = getSupabaseService();
  const { data } = await supabase.from('users').select('role').eq('user_id', userId).single();
  if (data?.role !== 'admin') throw new Error('Unauthorized: Admin access required');
}

async function verifyShipmentOwner(userId: string, shipmentId: number) {
  const supabase = getSupabaseService();
  const { data } = await supabase
    .from('prep_shipments').select('user_id').eq('id', shipmentId).single();
  if (!data || data.user_id !== userId) throw new Error('Unauthorized: not your shipment');
}

async function getUserCompanyId(userId: string): Promise<number | null> {
  const supabase = getSupabaseService();
  const { data } = await supabase.from('users').select('company_id').eq('user_id', userId).single();
  return data?.company_id ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PrepStatus =
  | 'submitted' | 'in_transit' | 'received' | 'prepping'
  | 'complete' | 'shipped_to_amazon' | 'cancelled';

export interface PrepItemInput {
  product_name: string;
  asin?: string | null;
  fnsku?: string | null;
  units_expected: number;
  prep_type?: string | null;
  notes?: string | null;
}

export interface PrepShipmentInput {
  supplier_name: string;
  tracking_number?: string | null;
  po_number?: string | null;
  estimated_arrival?: string | null;  // YYYY-MM-DD
  client_notes?: string | null;
}

// ---------------------------------------------------------------------------
// CLIENT ACTIONS
// ---------------------------------------------------------------------------

export async function createShipment(
  userId: string,
  data: PrepShipmentInput,
  items: PrepItemInput[],
) {
  const supabase = getSupabaseService();
  const companyId = await getUserCompanyId(userId);
  if (!companyId) throw new Error('User has no company; cannot create shipment');

  const unitCountExpected = items.reduce((s, i) => s + (i.units_expected || 0), 0);

  const { data: shipment, error } = await supabase
    .from('prep_shipments')
    .insert({
      user_id: userId,
      company_id: companyId,
      supplier_name: data.supplier_name,
      tracking_number: data.tracking_number ?? null,
      po_number: data.po_number ?? null,
      estimated_arrival: data.estimated_arrival ?? null,
      client_notes: data.client_notes ?? null,
      unit_count_expected: unitCountExpected || null,
      status: 'submitted',
    })
    .select()
    .single();
  if (error || !shipment) throw new Error(`Create shipment failed: ${error?.message}`);

  if (items.length > 0) {
    const rows = items.map((i) => ({
      shipment_id: shipment.id,
      product_name: i.product_name,
      asin: i.asin ?? null,
      fnsku: i.fnsku ?? null,
      units_expected: i.units_expected || 0,
      prep_type: i.prep_type ?? null,
      notes: i.notes ?? null,
    }));
    const { error: itemErr } = await supabase.from('prep_shipment_items').insert(rows);
    if (itemErr) throw new Error(`Create shipment items failed: ${itemErr.message}`);
  }

  return shipment;
}

export async function updateShipment(
  userId: string,
  shipmentId: number,
  data: PrepShipmentInput,
) {
  await verifyShipmentOwner(userId, shipmentId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('prep_shipments').update({
    supplier_name: data.supplier_name,
    tracking_number: data.tracking_number ?? null,
    po_number: data.po_number ?? null,
    estimated_arrival: data.estimated_arrival ?? null,
    client_notes: data.client_notes ?? null,
  }).eq('id', shipmentId).in('status', ['submitted','in_transit']);
  if (error) throw new Error(`Update shipment failed: ${error.message}`);
}

export async function cancelShipment(userId: string, shipmentId: number) {
  await verifyShipmentOwner(userId, shipmentId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('prep_shipments').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
  }).eq('id', shipmentId).in('status', ['submitted','in_transit']);
  if (error) throw new Error(`Cancel failed: ${error.message}`);
}

export async function uploadDocument(input: {
  userId: string;
  shipmentId: number;
  documentType: string;
  fileName: string;
  fileBase64: string;     // data URL sans prefix OK
  fileMime: string;
  fileSize: number;
  notes?: string | null;
}) {
  await verifyShipmentOwner(input.userId, input.shipmentId);
  return uploadDocumentInternal({ ...input, isAdmin: false });
}

export async function uploadWarehouseDocument(input: {
  adminUserId: string;
  shipmentId: number;
  documentType: string;
  fileName: string;
  fileBase64: string;
  fileMime: string;
  fileSize: number;
  notes?: string | null;
}) {
  await verifyAdmin(input.adminUserId);
  return uploadDocumentInternal({
    userId: input.adminUserId,
    shipmentId: input.shipmentId,
    documentType: input.documentType,
    fileName: input.fileName,
    fileBase64: input.fileBase64,
    fileMime: input.fileMime,
    fileSize: input.fileSize,
    notes: input.notes,
    isAdmin: true,
  });
}

async function uploadDocumentInternal(input: {
  userId: string;
  shipmentId: number;
  documentType: string;
  fileName: string;
  fileBase64: string;
  fileMime: string;
  fileSize: number;
  notes?: string | null;
  isAdmin: boolean;
}) {
  const supabase = getSupabaseService();
  // Strip `data:*;base64,` prefix if present
  const base64 = input.fileBase64.includes(',')
    ? input.fileBase64.substring(input.fileBase64.indexOf(',') + 1)
    : input.fileBase64;
  const buffer = Buffer.from(base64, 'base64');

  // Fetch owner for path prefix (files under {owner_user_id}/{shipment_id}/...)
  const { data: ship } = await supabase
    .from('prep_shipments').select('user_id').eq('id', input.shipmentId).single();
  const ownerUserId = ship?.user_id ?? input.userId;

  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${ownerUserId}/${input.shipmentId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from('prep-documents')
    .upload(path, buffer, { contentType: input.fileMime, upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data: doc, error: docErr } = await supabase
    .from('prep_documents')
    .insert({
      shipment_id: input.shipmentId,
      uploaded_by: input.userId,
      document_type: input.documentType,
      file_name: input.fileName,
      file_url: path,
      file_size: input.fileSize,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (docErr) throw new Error(`Doc row insert failed: ${docErr.message}`);

  // Notify the client if admin uploaded to their shipment
  if (input.isAdmin) {
    await createNotificationInternal(ownerUserId, input.shipmentId, 'document_uploaded',
      `Warehouse uploaded a new ${prettyDocType(input.documentType)}: ${input.fileName}`);
  }
  return doc;
}

export async function getSignedDocumentUrl(path: string, expiresSec = 3600) {
  const supabase = getSupabaseService();
  const { data, error } = await supabase.storage
    .from('prep-documents')
    .createSignedUrl(path, expiresSec);
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

export async function getMyShipments(userId: string) {
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from('prep_shipments')
    .select(`
      *,
      items:prep_shipment_items(*),
      documents:prep_documents(*),
      invoices:prep_invoices(*, line_items:prep_invoice_line_items(*))
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getShipmentDetail(userId: string, shipmentId: number) {
  const supabase = getSupabaseService();
  // Admin can view any; owner can view own
  const { data: user } = await supabase.from('users').select('role').eq('user_id', userId).single();
  const isAdmin = user?.role === 'admin';

  let q = supabase.from('prep_shipments').select(`
      *,
      items:prep_shipment_items(*),
      documents:prep_documents(*),
      invoices:prep_invoices(*, line_items:prep_invoice_line_items(*)),
      owner:users!prep_shipments_user_id_fkey(firstname, lastname, email),
      company:company_id(name)
    `).eq('id', shipmentId);
  if (!isAdmin) q = q.eq('user_id', userId);

  const { data, error } = await q.single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getMyInvoices(userId: string) {
  const supabase = getSupabaseService();
  const companyId = await getUserCompanyId(userId);
  if (!companyId) return [];
  const { data, error } = await supabase
    .from('prep_invoices')
    .select('*, line_items:prep_invoice_line_items(*), shipment:prep_shipments(id, supplier_name, po_number)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markInvoicePaid(userId: string, invoiceId: number) {
  const supabase = getSupabaseService();
  const companyId = await getUserCompanyId(userId);
  if (!companyId) throw new Error('No company');

  const { data: inv } = await supabase
    .from('prep_invoices')
    .select('id, invoice_number, company_id, total, shipment_id')
    .eq('id', invoiceId)
    .single();
  if (!inv || inv.company_id !== companyId) throw new Error('Invoice not found or not yours');

  const { error } = await supabase
    .from('prep_invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) throw new Error(`Mark paid failed: ${error.message}`);

  // Notify all admins that this client marked the invoice paid
  const { data: admins } = await supabase.from('users').select('user_id').eq('role', 'admin');
  const msg = `Invoice ${inv.invoice_number} ($${Number(inv.total).toFixed(2)}) marked PAID by client`;
  for (const a of admins ?? []) {
    await createNotificationInternal(a.user_id, inv.shipment_id, 'warehouse_message', msg);
  }
}

export async function getMyNotifications(userId: string, limit = 50) {
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from('prep_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMyUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = getSupabaseService();
  const { count } = await supabase
    .from('prep_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

export async function markNotificationRead(userId: string, notificationId: number) {
  const supabase = getSupabaseService();
  const { error } = await supabase.from('prep_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = getSupabaseService();
  const { error } = await supabase.from('prep_notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// ADMIN / WAREHOUSE ACTIONS
// ---------------------------------------------------------------------------

export async function getAllShipments(adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from('prep_shipments')
    .select(`
      *,
      items:prep_shipment_items(*),
      documents:prep_documents(*),
      invoices:prep_invoices(*, line_items:prep_invoice_line_items(*)),
      owner:users!prep_shipments_user_id_fkey(firstname, lastname, email),
      company:company_id(name)
    `)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateShipmentStatus(
  adminUserId: string,
  shipmentId: number,
  status: PrepStatus,
  warehouseNotes?: string | null,
) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();

  const stamp: Record<string, string> = { updated_at: new Date().toISOString() };
  const statusCol: Record<PrepStatus, string | null> = {
    submitted: 'submitted_at',
    in_transit: 'in_transit_at',
    received: 'received_at',
    prepping: 'prepping_at',
    complete: 'complete_at',
    shipped_to_amazon: 'shipped_to_amazon_at',
    cancelled: 'cancelled_at',
  };
  const col = statusCol[status];
  if (col) stamp[col] = new Date().toISOString();

  const { data: shipment, error } = await supabase
    .from('prep_shipments')
    .update({ status, ...(warehouseNotes !== undefined ? { warehouse_notes: warehouseNotes } : {}), ...stamp })
    .eq('id', shipmentId)
    .select('user_id, supplier_name')
    .single();
  if (error || !shipment) throw new Error(`Status update failed: ${error?.message}`);

  await createNotificationInternal(
    shipment.user_id, shipmentId,
    status === 'received' ? 'shipment_received' : 'status_change',
    `Shipment "${shipment.supplier_name}" is now ${prettyStatus(status)}`,
  );
}

export async function updateReceivedUnits(
  adminUserId: string,
  shipmentId: number,
  unitCountReceived: number,
) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('prep_shipments')
    .update({ unit_count_received: unitCountReceived })
    .eq('id', shipmentId);
  if (error) throw new Error(error.message);
}

export async function addShipmentItem(
  adminUserId: string,
  shipmentId: number,
  item: PrepItemInput,
) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { data, error } = await supabase.from('prep_shipment_items').insert({
    shipment_id: shipmentId,
    product_name: item.product_name,
    asin: item.asin ?? null,
    fnsku: item.fnsku ?? null,
    units_expected: item.units_expected || 0,
    prep_type: item.prep_type ?? null,
    notes: item.notes ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateShipmentItem(
  adminUserId: string,
  itemId: number,
  data: { units_received?: number; units_damaged?: number; notes?: string | null; prep_type?: string | null },
) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('prep_shipment_items').update(data).eq('id', itemId);
  if (error) throw new Error(error.message);
}

// --- Invoice numbering: PREP-YYYY-NNNN (4-digit, per calendar year) ---
async function nextInvoiceNumber(): Promise<string> {
  const supabase = getSupabaseService();
  const year = new Date().getUTCFullYear();
  const prefix = `PREP-${year}-`;
  const { data } = await supabase
    .from('prep_invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1);
  const last = data?.[0]?.invoice_number;
  const lastN = last ? parseInt(last.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastN + 1).padStart(4, '0')}`;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export async function createInvoice(
  adminUserId: string,
  shipmentId: number,
  lineItems: InvoiceLineInput[],
  options: { dueDate?: string | null; taxRate?: number; notes?: string | null } = {},
) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  if (lineItems.length === 0) throw new Error('Invoice must have at least one line item');

  const { data: shipment } = await supabase
    .from('prep_shipments')
    .select('id, company_id, user_id, supplier_name')
    .eq('id', shipmentId)
    .single();
  if (!shipment) throw new Error('Shipment not found');

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const tax = +(subtotal * (options.taxRate ?? 0)).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  const number = await nextInvoiceNumber();

  const { data: inv, error: invErr } = await supabase.from('prep_invoices').insert({
    shipment_id: shipmentId,
    company_id: shipment.company_id,
    invoice_number: number,
    status: 'sent',
    subtotal: +subtotal.toFixed(2),
    tax,
    total,
    due_date: options.dueDate ?? null,
    notes: options.notes ?? null,
  }).select().single();
  if (invErr || !inv) throw new Error(`Invoice create failed: ${invErr?.message}`);

  const rows = lineItems.map((li) => ({
    invoice_id: inv.id,
    description: li.description,
    quantity: li.quantity,
    unit_price: +li.unit_price.toFixed(2),
    total: +(li.quantity * li.unit_price).toFixed(2),
  }));
  const { error: liErr } = await supabase.from('prep_invoice_line_items').insert(rows);
  if (liErr) throw new Error(liErr.message);

  await createNotificationInternal(
    shipment.user_id, shipmentId, 'invoice_ready',
    `Invoice ${number} is ready · $${total.toFixed(2)} due ${options.dueDate ?? 'on receipt'}`,
  );
  return { ...inv, line_items: rows };
}

export async function updateInvoiceStatus(
  adminUserId: string,
  invoiceId: number,
  status: 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled',
) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const patch: Record<string, unknown> = { status };
  if (status === 'paid') patch.paid_at = new Date().toISOString();
  const { error } = await supabase.from('prep_invoices').update(patch).eq('id', invoiceId);
  if (error) throw new Error(error.message);
}

export async function createNotification(
  adminUserId: string,
  userId: string,
  shipmentId: number | null,
  type: string,
  message: string,
) {
  await verifyAdmin(adminUserId);
  return createNotificationInternal(userId, shipmentId, type, message);
}

async function createNotificationInternal(
  userId: string,
  shipmentId: number | null,
  type: string,
  message: string,
) {
  const supabase = getSupabaseService();
  const { error } = await supabase.from('prep_notifications').insert({
    user_id: userId,
    shipment_id: shipmentId,
    type,
    message,
  });
  if (error) console.warn('Failed to insert notification:', error.message);
}

export async function getAdminPrepDashboard(adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - ((startOfWeek.getUTCDay() + 6) % 7));

  const [active, pending, receivedToday, receivedThisWeek, notInvoiced] = await Promise.all([
    supabase.from('prep_shipments').select('id', { count: 'exact', head: true })
      .not('status', 'in', '(complete,shipped_to_amazon,cancelled)'),
    supabase.from('prep_invoices').select('total')
      .eq('status', 'sent'),
    supabase.from('prep_shipments').select('unit_count_received')
      .gte('received_at', startOfToday.toISOString())
      .not('unit_count_received', 'is', null),
    supabase.from('prep_shipments').select('unit_count_received')
      .gte('received_at', startOfWeek.toISOString())
      .not('unit_count_received', 'is', null),
    supabase.from('prep_shipments').select('id, supplier_name, unit_count_received, invoices:prep_invoices(id)')
      .eq('status', 'received'),
  ]);

  const pendingTotal = (pending.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
  const unitsToday = (receivedToday.data ?? []).reduce((s, r) => s + (r.unit_count_received ?? 0), 0);
  const unitsThisWeek = (receivedThisWeek.data ?? []).reduce((s, r) => s + (r.unit_count_received ?? 0), 0);
  const needsInvoice = (notInvoiced.data ?? []).filter((s: { invoices: unknown[] }) => !s.invoices || s.invoices.length === 0).length;

  return {
    activeShipments: active.count ?? 0,
    pendingInvoiceTotal: pendingTotal,
    unitsReceivedToday: unitsToday,
    unitsReceivedThisWeek: unitsThisWeek,
    shipmentsNeedingAttention: needsInvoice,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function prettyStatus(s: PrepStatus): string {
  return { submitted: 'SUBMITTED', in_transit: 'IN TRANSIT', received: 'RECEIVED',
           prepping: 'PREPPING', complete: 'COMPLETE',
           shipped_to_amazon: 'SHIPPED TO AMAZON', cancelled: 'CANCELLED' }[s];
}

function prettyDocType(t: string): string {
  return t.replace(/_/g, ' ');
}
