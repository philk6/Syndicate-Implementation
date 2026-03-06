'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { useNetworkResilience } from '@/hooks/useNetworkResilience';
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
  leadtime: string;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
  is_public: boolean;
  // order_whitelists is no longer needed in the client-side select for filtering,
  // as RLS handles the join. It's good practice to only select what you need.
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  // userCompanyId is no longer strictly needed in state for the query,
  // as RLS uses auth.uid() directly, but keeping it might be useful for other client-side logic.
  // const [userCompanyId, setUserCompanyId] = useState<number | null>(null);
  const { isAuthenticated, loading } = useAuth();
  const { withNetworkResilience } = useNetworkResilience();
  const router = useRouter();

  // Memoized function to fetch orders (RLS will handle accessibility)
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);

    try {
      await withNetworkResilience(async (signal) => {
        // The RLS policy on the 'orders' table will now filter based on 'is_public'
        // and 'order_whitelists' for the authenticated user.
        // So, we don't need complex .or() conditions here.
        let query = supabase
          .from('orders')
          .select(`
        order_id,
        leadtime,
        deadline,
        label_upload_deadline,
        order_statuses!order_status_id (description),
        is_public
      `)
          .neq('order_status_id', 3) // Filter out order_status_id = 3 (Draft)
          .not('order_statuses.description', 'eq', 'Draft') // Filter out 'Draft' status explicitly
          .order('deadline', { ascending: true });

        if (signal) {
          query = query.abortSignal(signal);
        }

        const { data, error } = await query as { data: Order[] | null, error: PostgrestError | null };

        if (error) {
          console.error('Error fetching orders:', error);
          throw error;
        } else {
          console.log('Fetched orders:', data);
          setOrders(data || []);
        }
      }, { timeout: 10000, retries: 2 });
    } catch (error) {
      console.error('Failed to fetch orders after retries:', error);
      // Don't clear orders on error, keep showing previous data
    } finally {
      setLoadingOrders(false);
    }
  }, [withNetworkResilience]); // Include withNetworkResilience as dependency

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // No need to fetch userCompanyId explicitly for the query here anymore,
    // as the RLS policy directly uses auth.uid() to determine company_id.
    fetchOrders();
  }, [isAuthenticated, loading, router, fetchOrders]); // fetchOrders is a dependency

  // Memoized function to handle order navigation
  const handleOrderClick = useCallback((orderId: number) => {
    router.push(`/orders/${orderId}`);
  }, [router]);

  // Memoized function to calculate progress
  const calculateProgress = useCallback((deadline: string): number => {
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
  }, []);

  // Memoize the render of orders table rows to prevent unnecessary re-renders
  const orderRows = useMemo(() =>
    orders.map((order) => (
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
    )),
    [orders, handleOrderClick, calculateProgress]);

  if (loading || loadingOrders) { // Combined loading states
    return (
      <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null; // Should be handled by router.push('/login')

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">Orders</h1>
        <div className="card max-w-full border-[#2b2b2b] border-solid border">
          {orders.length === 0 ? (
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
                {orderRows}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
