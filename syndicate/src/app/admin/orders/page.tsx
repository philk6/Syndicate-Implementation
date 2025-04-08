'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { supabase } from '../../../../lib/supabase';
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
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Upload } from 'lucide-react';
import Link from 'next/link';

interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string } | null; // Allow null for new uploads
}

// Define interface for rows read from Excel
interface ExcelRow {
  'Status': string;
  'Deadline': string; // Parsed as string due to dateNF
  'Label Upload Deadline': string; // Parsed as string
  'Lead Time (days)': number;
  'ASIN': string;
  'Price': number;
  'Quantity': number;
  'Description'?: string; // Optional column
  [key: string]: string | number | undefined; // Allow for other potential columns
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statuses, setStatuses] = useState<{ order_status_id: number; description: string }[]>([]);
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
  }, [isAuthenticated, authLoading, router, user]);

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
      alert('Failed to create new order. Please try again.');
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
      const workbook = read(data, { type: 'array', dateNF: 'yyyy-mm-dd' }); // Enable date parsing
      const sheet = workbook.Sheets['Order'];
      if (!sheet) {
        setUploadMessage('Sheet "Order" not found in the file');
        return;
      }

      // Define the type for the rows read from the excel sheet
      const rows: ExcelRow[] = utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' }); // Convert dates to strings
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

      // Ensure dates are in ISO format
      const deadline = new Date(firstRow['Deadline']).toISOString();
      const labelUploadDeadline = new Date(firstRow['Label Upload Deadline']).toISOString();

      if (isNaN(new Date(deadline).getTime()) || isNaN(new Date(labelUploadDeadline).getTime())) {
        setUploadMessage('Invalid date format in Deadline or Label Upload Deadline');
        return;
      }

      // Create the order
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

      // Create product lines
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

  if (authLoading || loadingOrders) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-[#d1d5db]">Admin - All Orders</h1>
          <div className="flex items-center space-x-2">
            <Button
              onClick={handleCreateOrder}
              className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
            >
              Create New Order
            </Button>
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]">
                  <Upload className="mr-2 h-4 w-4" /> Upload Order
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                <DialogHeader>
                  <DialogTitle>Upload Order File</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Upload an .xlsx file with columns: Lead Time (days), Deadline, Label Upload Deadline, Status, ASIN, Price, Quantity, Description.
                  </p>
                  <Input
                    type="file"
                    accept=".xlsx"
                    onChange={handleFileChange}
                    className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                  />
                  <Button
                    onClick={handleFileSubmit}
                    className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                  >
                    Submit
                  </Button>
                  {uploadMessage && (
                    <p
                      className={`text-sm ${
                        uploadMessage.includes('successfully') ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {uploadMessage}
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="card max-w-full border-[#2b2b2b] border-solid border">
          {orders.length === 0 ? (
            <p className="text-gray-400 text-center">No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[#2b2b2b] bg-transparent hover:bg-transparent">
                  <TableHead className="text-gray-300">Order ID</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                  <TableHead className="text-gray-300">Lead Time (days)</TableHead>
                  <TableHead className="text-gray-300">Application Deadline</TableHead>
                  <TableHead className="text-gray-300">Label Upload Deadline</TableHead>
                  <TableHead className="text-gray-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.order_id}
                    className="hover:bg-[#35353580] transition-colors border-[#2b2b2b]"
                  >
                    <TableCell className="text-gray-200">{order.order_id}</TableCell>
                    <TableCell className="text-gray-200">
                      <Badge variant="outline" className="bg-[#c8aa64] text-[#242424]">
                        {order.order_statuses?.description || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-200">{order.leadtime}</TableCell>
                    <TableCell className="text-gray-200">
                      {new Date(order.deadline).toLocaleString()}
                      <Progress value={calculateProgress(order.deadline)} />
                    </TableCell>
                    <TableCell className="text-gray-200">
                      {new Date(order.label_upload_deadline).toLocaleString()}
                      <Progress value={calculateProgress(order.label_upload_deadline)} />
                    </TableCell>
                    <TableCell>
                      <Button
                        asChild
                        className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                      >
                        <Link href={`/admin/orders/${order.order_id}`}>Manage</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}