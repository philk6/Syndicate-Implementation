'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import { read, utils } from 'xlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Upload, Trash2 } from 'lucide-react';
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

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statuses, setStatuses] = useState<{ order_status_id: number; description: string }[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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
      // We need the current user's UUID for created_by
      const authUser = (await supabase.auth.getUser()).data.user;
      if (!authUser) throw new Error('Not authenticated');

      // Run the atomic server-side delete for each order
      await Promise.all(
        selectedOrders.map(async (orderId) => {
          const { error } = await supabase.rpc('admin_release_credit_and_delete_order', {
            p_order_id: orderId,
            p_user_id: authUser.id, // UUID
          });
          if (error) {
            throw new Error(`Failed to delete order ${orderId}: ${error.message}`);
          }
        })
      );

      // Update UI
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
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen p-6 w-full">
      <Toaster richColors position="bottom-right" closeButton={true} duration={3000} />
      <div className="mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Admin - All Orders</h1>
          <div className="flex items-center space-x-3">
            <Button
              onClick={handleCreateOrder}
              className="bg-gradient-to-t from-amber-700/50 to-amber-500/80 hover:from-amber-700/70 hover:to-amber-500 text-white border border-amber-500/20 shadow-lg shadow-amber-900/20"
            >
              Create New Order
            </Button>
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <Button className="bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1]">
                  <Upload className="mr-2 h-4 w-4" /> Upload Order
                </Button>
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
                  <Button
                    onClick={handleFileSubmit}
                    className="w-full bg-gradient-to-t from-amber-700/50 to-amber-500/80 hover:from-amber-700/70 hover:to-amber-500 text-white border border-amber-500/20"
                  >
                    Submit
                  </Button>
                  {uploadMessage && (
                    <p
                      className={`text-sm ${uploadMessage.includes('successfully') ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                    >
                      {uploadMessage}
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="destructive"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={selectedOrders.length === 0}
              className="bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
            </Button>
          </div>
        </div>
        <GlassCard>
          {orders.length === 0 ? (
            <p className="text-neutral-500 text-center py-8">No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/[0.05] hover:bg-transparent">
                  <TableHead className="text-neutral-400 w-[5%] px-4">
                    <Checkbox
                      checked={selectedOrders.length === orders.length && orders.length > 0}
                      onCheckedChange={(checked) => {
                        setSelectedOrders(checked ? orders.map(order => order.order_id) : []);
                      }}
                      className="h-4 w-4 border-white/[0.2] data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                    />
                  </TableHead>
                  <TableHead className="text-neutral-400">Order ID</TableHead>
                  <TableHead className="text-neutral-400">Status</TableHead>
                  <TableHead className="text-neutral-400">Lead Time (days)</TableHead>
                  <TableHead className="text-neutral-400">Application Deadline</TableHead>
                  <TableHead className="text-neutral-400">Label Upload Deadline</TableHead>
                  <TableHead className="text-neutral-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.order_id}
                    className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.02]"
                  >
                    <TableCell className="px-4">
                      <Checkbox
                        checked={selectedOrders.includes(order.order_id)}
                        onCheckedChange={() => handleSelectOrder(order.order_id)}
                        className="h-4 w-4 border-white/[0.2] data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                    </TableCell>
                    <TableCell className="text-neutral-200">#{order.order_id}</TableCell>
                    <TableCell className="text-neutral-200">
                      <StatusPill text={order.order_statuses?.description || 'N/A'} type={order.order_statuses?.description || 'N/A'} />
                    </TableCell>
                    <TableCell className="text-neutral-200">{order.leadtime}</TableCell>
                    <TableCell className="text-neutral-200">
                      <div className="mb-1">{new Date(order.deadline).toLocaleString()}</div>
                      <Progress value={calculateProgress(order.deadline)} className="h-1 bg-white/[0.05]" />
                    </TableCell>
                    <TableCell className="text-neutral-200">
                      <div className="mb-1">{new Date(order.label_upload_deadline).toLocaleString()}</div>
                      <Progress value={calculateProgress(order.label_upload_deadline)} className="h-1 bg-white/[0.05]" />
                    </TableCell>
                    <TableCell>
                      <Button
                        asChild
                        className="bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1] h-8 text-xs"
                      >
                        <Link href={`/admin/orders/${order.order_id}`}>Manage</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </GlassCard>
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent className="bg-[#0a0a0a]/95 backdrop-blur-xl border-white/[0.08] text-neutral-200">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription className="text-neutral-400">
                This action cannot be undone. Deleting these orders will remove all associated data, including products, pre-assignments, company applications, and allocation results.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/[0.05] hover:bg-white/[0.1] text-neutral-200 border-white/[0.1]">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteOrders}
                className="bg-rose-600 hover:bg-rose-500 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}