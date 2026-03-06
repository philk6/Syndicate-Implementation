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

export default function HistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const { isAuthenticated, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchOrders() {
      try {
        // Fetch user's company_id
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('company_id')
          .eq('user_id', user?.user_id)
          .single();

        if (userError || !userData?.company_id) {
          console.error('Error fetching user data or no company_id:', userError?.message || 'No company_id found');
          setOrders([]);
          setLoadingOrders(false);
          return;
        }

        const companyId = userData.company_id;

        // Fetch orders where the company has applied or been allocated
        // Use a union of order_ids from order_company and allocation_results
        const { data: orderIdsData, error: orderIdsError } = await supabase
          .rpc('get_company_order_ids', { p_company_id: companyId });

        if (orderIdsError) {
          console.error('Error fetching order IDs:', orderIdsError.message, orderIdsError.details);
          setOrders([]);
          setLoadingOrders(false);
          return;
        }

        const orderIds = orderIdsData?.map((row: { order_id: number }) => row.order_id) || [];

        if (orderIds.length === 0) {
          setOrders([]);
          setLoadingOrders(false);
          return;
        }

        // Fetch order details for the relevant order IDs
        const { data, error } = await supabase
          .from('orders')
          .select(`
            order_id,
            leadtime,
            deadline,
            label_upload_deadline,
            order_statuses!order_status_id (description)
          `)
          .in('order_id', orderIds)
          .neq('order_status_id', 3)
          .not('order_statuses.description', 'eq', 'Draft')
          .order('deadline', { ascending: true }) as { data: Order[] | null, error: PostgrestError | null };

        if (error) {
          console.error('Error fetching orders:', error.message, error.details, error.hint);
          setOrders([]);
        } else {
          setOrders(data || []);
        }
      } catch (err) {
        console.error('Unexpected error fetching orders:', err);
        setOrders([]);
      } finally {
        setLoadingOrders(false);
      }
    }

    fetchOrders();
  }, [isAuthenticated, loading, router, user]);

  const handleOrderClick = (orderId: number) => {
    router.push(`/history/${orderId}`);
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
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">Order History</h1>
        <div className="card max-w-full border-[#2b2b2b] border-solid border">
          {loadingOrders ? (
            <p className="text-gray-400 text-center">Loading orders...</p>
          ) : orders.length === 0 ? (
            <p className="text-gray-400 text-center">No orders found in your history.</p>
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
                      <Badge>
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