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

interface ExcelRow {
  'Status': string;
  'Deadline': string;
  'Label Upload Deadline': string;
  'Lead Time (days)': number;
  'ASIN': string;
  'Price': number;
  'Quantity': number;
  'Description'?: string;
  [key: string]: string | number | undefined;
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
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = read(data, { type: 'array', dateNF: 'yyyy-mm-dd' });
      const sheet = workbook.Sheets['Order'];
      if (!sheet) {
        setUploadMessage('Sheet "Order" not found in the file');
        return;
      }
      const rows: ExcelRow[] = utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });
      if (rows.length === 0) {
        setUploadMessage('No data found in the file');
        return;
      }
      const firstRow = rows[0];
      const status = statuses.find(s => s.description === firstRow['Status']);
      if (!status) {
        setUploadMessage(`Invalid status: ${firstRow['Status']}`);
        return;
      }
      const deadline = new Date(firstRow['Deadline']).toISOString();
      const labelUploadDeadline = new Date(firstRow['Label Upload Deadline']).toISOString();
      if (isNaN(new Date(deadline).getTime()) || isNaN(new Date(labelUploadDeadline).getTime())) {
        setUploadMessage('Invalid date format in Deadline or Label Upload Deadline');
        return;
      }
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          leadtime: firstRow['Lead Time (days)'],
          deadline: deadline,
          label_upload_deadline: labelUploadDeadline,
          order_status_id: status.order_status_id,
          total_amount: 0,
        })
        .select('order_id')
        .single();
      if (orderError || !orderData) {
        setUploadMessage('Failed to create order: ' + orderError?.message);
        return;
      }
      const productsToInsert = rows.map((row, index) => ({
        order_id: orderData.order_id,
        sequence: index + 1,
        asin: row['ASIN'],
        price: row['Price'],
        cost_price: row['Price'],
        quantity: row['Quantity'],
        description: row['Description'] || '',
      }));
      const { error: productsError } = await supabase
        .from('order_products')
        .insert(productsToInsert);
      if (productsError) {
        setUploadMessage('Failed to create product lines: ' + productsError.message);
        await supabase.from('orders').delete().eq('order_id', orderData.order_id);
      } else {
        setUploadMessage('Order created successfully!');
        setOrders(prev => [...prev, {
          order_id: orderData.order_id,
          leadtime: firstRow['Lead Time (days)'],
          deadline: deadline,
          label_upload_deadline: labelUploadDeadline,
          order_statuses: { description: status.description },
        }]);
        setIsUploadOpen(false);
        setSelectedFile(null);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
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
                  <p className="text-sm text-neutral-400">
                    Upload an .xlsx file with columns: Lead Time (days), Deadline, Label Upload Deadline, Status, ASIN, Price, Quantity, Description.
                  </p>
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
                    <p
                      className={`text-sm ${uploadMessage.includes('successfully') ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                      {uploadMessage}
                    </p>
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
