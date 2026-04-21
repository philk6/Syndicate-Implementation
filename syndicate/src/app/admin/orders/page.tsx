'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import { read, utils } from 'xlsx';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Upload, Trash2, ShoppingCart } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast, Toaster } from 'sonner';
import Link from 'next/link';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  PageShell, PageHeader, SectionLabel, DsStatusPill,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsButton, DsEmpty, DsCountPill, DS,
} from '@/components/ui/ds';

interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string } | null;
}


const STATUS_COLOR: Record<string, string> = {
  open: '#4ade80',
  closed: '#FF4444',
  new: '#3B82F6',
  late: '#FF4444',
  done: '#4ade80',
  progress: '#FFD93D',
  warehouse: '#FFD93D',
  amazon: '#818cf8',
  walmart: '#22d3ee',
  active: '#4ade80',
  pending: '#FFD93D',
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statuses, setStatuses] = useState<{ order_status_id: number; description: string }[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || user?.role !== 'admin') {
      router.push('/login');
      return;
    }
    async function fetchData() {
      setLoadingOrders(true);
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          order_id,
          leadtime,
          deadline,
          label_upload_deadline,
          order_statuses!order_status_id (description)
        `)
        .order('order_id', { ascending: false })
        .order('deadline', { ascending: true }) as { data: Order[] | null, error: PostgrestError | null };
      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      } else {
        setOrders(ordersData || []);
      }
      const { data: statusData, error: statusError } = await supabase
        .from('order_statuses')
        .select('order_status_id, description');
      if (statusError) {
        console.error('Error fetching statuses:', statusError);
      } else {
        setStatuses(statusData || []);
      }
      setLoadingOrders(false);
    }
    fetchData();
  }, [isAuthenticated, authLoading, router, user?.role]);

  const calculateProgress = (deadline: string): number => {
    const now = new Date();
    const deadlineDate = new Date(deadline + 'Z');
    if (isNaN(deadlineDate.getTime())) {
      return 0;
    }
    const diffMs = deadlineDate.getTime() - now.getTime();
    const daysLeft = diffMs / (1000 * 60 * 60 * 24);
    if (daysLeft > 5) {
      return 100;
    } else if (daysLeft >= 0) {
      return (daysLeft / 5) * 100;
    } else {
      return 0;
    }
  };

  const handleCreateOrder = async () => {
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 7);
    const defaultLabelDeadline = new Date();
    defaultLabelDeadline.setDate(defaultLabelDeadline.getDate() + 14);
    const { data, error } = await supabase
      .from('orders')
      .insert({
        leadtime: 5,
        deadline: defaultDeadline.toISOString(),
        label_upload_deadline: defaultLabelDeadline.toISOString(),
        order_status_id: 3,
        total_amount: 0,
      })
      .select('order_id')
      .single();
    if (error) {
      console.error('Error creating order:', error);
      toast.error('Failed to create new order. Please try again.');
    } else if (data) {
      router.push(`/admin/orders/${data.order_id}`);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadMessage('');
    }
  };

  const handleFileSubmit = async () => {
    if (!selectedFile) {
      setUploadMessage('Please select a file to upload.');
      return;
    }
    setUploadMessage('');

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = read(new Uint8Array(buffer), { type: 'array', dateNF: 'yyyy-mm-dd' });
      const sheet = workbook.Sheets['Order'];
      if (!sheet) {
        setUploadMessage('Sheet "Order" not found in the file');
        return;
      }

      // raw:false returns ISO strings for dates; raw:true returns Date objects.
      // We'll accept either in coerceDate.
      const rawRows = utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true });
      if (rawRows.length === 0) {
        setUploadMessage('No data found in the file');
        return;
      }

      // Case-insensitive / whitespace-tolerant header lookup
      const getCell = (row: Record<string, unknown>, target: string): unknown => {
        const normalizedTarget = target.toLowerCase().replace(/\s+/g, ' ').trim();
        for (const key of Object.keys(row)) {
          if (key.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedTarget) return row[key];
        }
        return undefined;
      };

      // Synonym map → canonical description (what we store in order_statuses)
      const STATUS_ALIASES: Record<string, string> = {
        draft:     'Draft',
        open:      'Draft',
        pending:   'Draft',
        new:       'Draft',
        active:    'Active',
        closed:    'Closed',
        fulfilled: 'Fulfilled',
        complete:  'Fulfilled',
        completed: 'Fulfilled',
        cancelled: 'Cancelled',
        canceled:  'Cancelled',
      };

      const coerceDate = (v: unknown): Date | null => {
        if (v == null || v === '') return null;
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
        if (typeof v === 'number') {
          // Excel serial date (days since 1899-12-30)
          const d = new Date(Math.round((v - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? null : d;
        }
        if (typeof v === 'string') {
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d;
        }
        return null;
      };

      const ASIN_RE = /^B0[A-Z0-9]{8}$/;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);
      const errors: string[] = [];
      const validated: Array<{
        leadTime: number;
        deadline: string;
        labelUploadDeadline: string;
        statusDescription: string;
        asin: string;
        price: number;
        quantity: number;
        description: string;
      }> = [];

      rawRows.forEach((row, i) => {
        const rowNum = i + 2; // header is row 1 in user-facing numbering

        // Status — default to Draft if missing
        const rawStatus = getCell(row, 'Status');
        const statusStr = typeof rawStatus === 'string' ? rawStatus.trim() : '';
        const statusKey = statusStr.toLowerCase();
        const statusDescription = statusStr === '' ? 'Draft' : STATUS_ALIASES[statusKey];
        if (!statusDescription) {
          errors.push(`Row ${rowNum}: status "${statusStr}" not recognized. Accepted: Draft, Active, Closed, Fulfilled, Cancelled.`);
        }

        // Lead Time
        const rawLead = getCell(row, 'Lead Time (days)');
        const leadTime = parseInt(String(rawLead ?? ''), 10);
        if (Number.isNaN(leadTime) || leadTime < 0) {
          errors.push(`Row ${rowNum}: Lead Time (days) "${rawLead}" is not a valid non-negative integer.`);
        }

        // Deadline
        const dl = coerceDate(getCell(row, 'Deadline'));
        if (!dl) errors.push(`Row ${rowNum}: Deadline is missing or invalid.`);
        else if (dl < thirtyDaysAgo) errors.push(`Row ${rowNum}: Deadline ${dl.toISOString().slice(0, 10)} is more than 30 days in the past.`);

        // Label Upload Deadline
        const lud = coerceDate(getCell(row, 'Label Upload Deadline'));
        if (!lud) errors.push(`Row ${rowNum}: Label Upload Deadline is missing or invalid.`);
        else if (lud < thirtyDaysAgo) errors.push(`Row ${rowNum}: Label Upload Deadline ${lud.toISOString().slice(0, 10)} is more than 30 days in the past.`);

        // ASIN
        const rawAsin = getCell(row, 'ASIN');
        const asin = typeof rawAsin === 'string' ? rawAsin.trim().toUpperCase() : '';
        if (!ASIN_RE.test(asin)) {
          errors.push(`Row ${rowNum}: ASIN "${rawAsin}" is not a valid Amazon ASIN (expected format: B0XXXXXXXX).`);
        }

        // Price
        const rawPrice = getCell(row, 'Price');
        const price = parseFloat(String(rawPrice ?? ''));
        if (Number.isNaN(price) || price < 0) {
          errors.push(`Row ${rowNum}: Price "${rawPrice}" is not a valid non-negative number.`);
        }

        // Quantity — template ships as string
        const rawQty = getCell(row, 'Quantity');
        const quantity = parseInt(String(rawQty ?? ''), 10);
        if (Number.isNaN(quantity) || quantity < 0) {
          errors.push(`Row ${rowNum}: Quantity "${rawQty}" is not a valid non-negative integer.`);
        }

        // Description
        const rawDesc = getCell(row, 'Description');
        const description = typeof rawDesc === 'string' ? rawDesc.trim() : '';
        if (!description) {
          errors.push(`Row ${rowNum}: Description is empty.`);
        }

        if (statusDescription && !Number.isNaN(leadTime) && dl && lud && ASIN_RE.test(asin) && !Number.isNaN(price) && !Number.isNaN(quantity) && description) {
          validated.push({
            leadTime,
            deadline: dl.toISOString(),
            labelUploadDeadline: lud.toISOString(),
            statusDescription,
            asin,
            price: +price.toFixed(2),
            quantity,
            description,
          });
        }
      });

      if (errors.length > 0) {
        setUploadMessage(`${errors.length} error(s) found — no orders created:\n• ${errors.slice(0, 10).join('\n• ')}${errors.length > 10 ? `\n• …and ${errors.length - 10} more` : ''}`);
        return;
      }

      // Resolve status description → status ID (uses the first row's status for the header order,
      // matching the original behavior where all rows share a single order metadata).
      const headerRow = validated[0];
      const status = statuses.find(s => s.description === headerRow.statusDescription);
      if (!status) {
        setUploadMessage(`Status "${headerRow.statusDescription}" is not yet configured in the database. Ask an admin to seed order_statuses.`);
        return;
      }

      // Create order (single row — same semantics as before)
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          leadtime: headerRow.leadTime,
          deadline: headerRow.deadline,
          label_upload_deadline: headerRow.labelUploadDeadline,
          order_status_id: status.order_status_id,
          total_amount: 0,
        })
        .select('order_id')
        .single();

      if (orderError || !orderData) {
        setUploadMessage('Failed to create order: ' + (orderError?.message ?? 'unknown error'));
        return;
      }

      // Insert all products atomically (single insert call)
      const productsToInsert = validated.map((r, index) => ({
        order_id: orderData.order_id,
        sequence: index + 1,
        asin: r.asin,
        price: r.price,
        cost_price: r.price,
        quantity: r.quantity,
        description: r.description,
      }));

      const { error: productsError } = await supabase
        .from('order_products')
        .insert(productsToInsert);

      if (productsError) {
        setUploadMessage('Failed to create product lines: ' + productsError.message);
        await supabase.from('orders').delete().eq('order_id', orderData.order_id);
        return;
      }

      setUploadMessage(`Order created successfully with ${validated.length} product line(s).`);
      setOrders(prev => [...prev, {
        order_id: orderData.order_id,
        leadtime: headerRow.leadTime,
        deadline: headerRow.deadline,
        label_upload_deadline: headerRow.labelUploadDeadline,
        order_statuses: { description: status.description },
      }]);
      setIsUploadOpen(false);
      setSelectedFile(null);
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadMessage(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const handleSelectOrder = (orderId: number) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleDeleteOrders = async () => {
    if (selectedOrders.length === 0) return;

    try {
      const authUser = (await supabase.auth.getUser()).data.user;
      if (!authUser) throw new Error('Not authenticated');

      await Promise.all(
        selectedOrders.map(async (orderId) => {
          const { error } = await supabase.rpc('admin_release_credit_and_delete_order', {
            p_order_id: orderId,
            p_user_id: authUser.id,
          });
          if (error) {
            throw new Error(`Failed to delete order ${orderId}: ${error.message}`);
          }
        })
      );

      setOrders(prev => prev.filter(o => !selectedOrders.includes(o.order_id)));
      setSelectedOrders([]);
      setIsDeleteDialogOpen(false);
      toast.success('Selected orders deleted and credit released.');
    } catch (err) {
      console.error('Error deleting orders:', err);
      toast.error(`Failed to delete orders: ${(err as Error).message}`);
    }
  };

  if (authLoading || loadingOrders) {
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  // Derive unique statuses from loaded orders for filter pills
  const uniqueStatuses = Array.from(new Set(orders.map(o => o.order_statuses?.description || 'N/A')));

  const filteredOrders = statusFilter === 'all'
    ? orders
    : orders.filter(o => (o.order_statuses?.description || 'N/A') === statusFilter);

  return (
    <PageShell>
      <Toaster richColors position="bottom-right" closeButton={true} duration={3000} />

      <PageHeader
        title="MANAGE ORDERS"
        subtitle={`${orders.length} total orders`}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <DsButton onClick={handleCreateOrder} accent={DS.orange}>
              Create New Order
            </DsButton>
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <DsButton variant="secondary" accent={DS.orange}>
                  <Upload className="w-3.5 h-3.5" /> Upload Order
                </DsButton>
              </DialogTrigger>
              <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-neutral-200">
                <DialogHeader>
                  <DialogTitle>Upload Order File</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5 text-sm text-neutral-400">
                    <p>
                      Upload an .xlsx file (sheet name <span className="font-mono text-neutral-300">Order</span>) with columns: <span className="text-neutral-300">Lead Time (days), Deadline, Label Upload Deadline, Status, ASIN, Price, Quantity, Description</span>.
                    </p>
                    <p className="text-xs text-neutral-500">
                      Status must be one of <span className="text-neutral-300">Draft, Active, Closed, Fulfilled, Cancelled</span>. Case-insensitive; leave blank to default to Draft.
                    </p>
                  </div>
                  <Input
                    type="file"
                    accept=".xlsx"
                    onChange={handleFileChange}
                    className="bg-white/[0.02] text-neutral-200 border-white/[0.05]"
                  />
                  <DsButton onClick={handleFileSubmit} className="w-full">
                    Submit
                  </DsButton>
                  {uploadMessage && (
                    <pre
                      className={`text-xs font-sans whitespace-pre-wrap max-h-48 overflow-y-auto ${uploadMessage.includes('successfully') ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                      {uploadMessage}
                    </pre>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <DsButton
              variant="danger"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={selectedOrders.length === 0}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </DsButton>
          </div>
        }
      />

      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mr-1">Filter:</span>
        <button
          onClick={() => setStatusFilter('all')}
          className="px-3 py-1 rounded-lg text-[11px] font-bold font-mono uppercase tracking-wider border transition-all"
          style={{
            backgroundColor: statusFilter === 'all' ? `${DS.orange}22` : 'transparent',
            borderColor: statusFilter === 'all' ? `${DS.orange}55` : 'rgba(255,255,255,0.08)',
            color: statusFilter === 'all' ? DS.orange : DS.muted,
          }}
        >
          All ({orders.length})
        </button>
        {uniqueStatuses.map((status) => {
          const c = STATUS_COLOR[status.toLowerCase()] || DS.muted;
          const count = orders.filter(o => (o.order_statuses?.description || 'N/A') === status).length;
          const active = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className="px-3 py-1 rounded-lg text-[11px] font-bold font-mono uppercase tracking-wider border transition-all"
              style={{
                backgroundColor: active ? `${c}22` : 'transparent',
                borderColor: active ? `${c}55` : 'rgba(255,255,255,0.08)',
                color: active ? c : DS.muted,
              }}
            >
              {status} ({count})
            </button>
          );
        })}
      </div>

      {/* Orders Table */}
      <div>
        <SectionLabel accent={DS.orange}>
          Orders <DsCountPill count={filteredOrders.length} />
        </SectionLabel>

        {filteredOrders.length === 0 ? (
          <DsEmpty
            icon={<ShoppingCart className="w-6 h-6" />}
            title="No Orders"
            body="No orders match the current filter."
          />
        ) : (
          <DsTable>
            <DsThead>
              <DsTh className="w-[5%]">
                <Checkbox
                  checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                  onCheckedChange={(checked) => {
                    setSelectedOrders(checked ? filteredOrders.map(order => order.order_id) : []);
                  }}
                  className="h-4 w-4 border-white/[0.2] data-[state=checked]:bg-[#FF6B35] data-[state=checked]:border-[#FF6B35]"
                />
              </DsTh>
              <DsTh>Order ID</DsTh>
              <DsTh>Status</DsTh>
              <DsTh>Lead Time</DsTh>
              <DsTh>Application Deadline</DsTh>
              <DsTh>Label Upload Deadline</DsTh>
              <DsTh>Actions</DsTh>
            </DsThead>
            <tbody>
              {filteredOrders.map((order) => {
                const statusText = order.order_statuses?.description || 'N/A';
                return (
                  <DsTr key={order.order_id}>
                    <DsTd>
                      <Checkbox
                        checked={selectedOrders.includes(order.order_id)}
                        onCheckedChange={() => handleSelectOrder(order.order_id)}
                        className="h-4 w-4 border-white/[0.2] data-[state=checked]:bg-[#FF6B35] data-[state=checked]:border-[#FF6B35]"
                      />
                    </DsTd>
                    <DsTd className="font-medium text-white">#{order.order_id}</DsTd>
                    <DsTd>
                      <DsStatusPill
                        label={statusText}
                        color={STATUS_COLOR[statusText.toLowerCase()] || DS.muted}
                      />
                    </DsTd>
                    <DsTd>{order.leadtime} days</DsTd>
                    <DsTd>
                      <div className="mb-1">{new Date(order.deadline).toLocaleString()}</div>
                      <Progress value={calculateProgress(order.deadline)} className="h-1 bg-white/[0.05]" />
                    </DsTd>
                    <DsTd>
                      <div className="mb-1">{new Date(order.label_upload_deadline).toLocaleString()}</div>
                      <Progress value={calculateProgress(order.label_upload_deadline)} className="h-1 bg-white/[0.05]" />
                    </DsTd>
                    <DsTd>
                      <Link href={`/admin/orders/${order.order_id}`}>
                        <DsButton variant="secondary" className="h-8 text-[10px]">
                          Manage
                        </DsButton>
                      </Link>
                    </DsTd>
                  </DsTr>
                );
              })}
            </tbody>
          </DsTable>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#0a0a0a]/95 backdrop-blur-xl border-white/[0.08] text-neutral-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              This action cannot be undone. Deleting these orders will remove all associated data, including products, pre-assignments, company applications, and allocation results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/[0.05] text-neutral-300 border-white/[0.08] hover:bg-white/[0.08]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrders}
              className="bg-[#FF4444]/10 text-[#FF4444] border border-[#FF4444]/30 hover:bg-[#FF4444]/20"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
