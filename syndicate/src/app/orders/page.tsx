'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
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

interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          order_id,
          leadtime,
          deadline,
          label_upload_deadline,
          order_statuses!order_status_id (description)
        `)
        .neq('order_status_id', 3) // Filter out order_status_id = 3
        .not('order_statuses.description', 'eq', 'Draft') // Filter out 'Draft'
        .order('deadline', { ascending: true }) as { data: Order[] | null, error: PostgrestError | null };

      if (error) {
        console.error('Error fetching orders:', error);
      } else {
        console.log('Fetched orders:', data);
        setOrders(data || []);
      }
      setLoadingOrders(false);
    }

    fetchOrders();
  }, [isAuthenticated, loading, router]);

  const handleOrderClick = (orderId: number) => {
    router.push(`/orders/${orderId}`);
  };

  const calculateProgress = (deadline: string): number => {
    const now = new Date();
    const deadlineDate = new Date(deadline + 'Z'); // Treat as UTC
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

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">Orders</h1>
        <div className="card max-w-full border-[#2b2b2b] border-solid border">
          {loadingOrders ? (
            <p className="text-gray-400 text-center">Loading orders...</p>
          ) : orders.length === 0 ? (
            <p className="text-gray-400 text-center">No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-gray-300">Order ID</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                  <TableHead className="text-gray-300">Lead Time (days)</TableHead>
                  <TableHead className="text-gray-300">Application Deadline</TableHead>
                  <TableHead className="text-gray-300">Label Upload Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.order_id}
                    className="hover:bg-[#35353580] transition-colors focus:ring-[#35353580] border-[#2b2b2b] cursor-pointer"
                    onClick={() => handleOrderClick(order.order_id)}
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