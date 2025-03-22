'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Define the Order type based on Supabase data
interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string }[]; // Updated to an array
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]); // Use Order[] instead of any[]
  const [loadingOrders, setLoadingOrders] = useState(true);
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait until auth check completes

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description)')
        .order('deadline', { ascending: true });

      if (error) {
        console.error('Error fetching orders:', error);
      } else {
        setOrders(data || []);
      }
      setLoadingOrders(false);
    }

    fetchOrders();
  }, [isAuthenticated, loading, router]);

  // Function to navigate to order detail page
  const handleOrderClick = (orderId: number) => {
    router.push(`/orders/${orderId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Orders</h1>
        <div className="card max-w-full">
          {loadingOrders ? (
            <p className="text-gray-400 text-center">Loading orders...</p>
          ) : orders.length === 0 ? (
            <p className="text-gray-400 text-center">No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className='border-[#6a6a6a80] hover:bg-[#35353580] hover:bg-[#202020]'>
                  <TableHead className="text-gray-300">Order ID</TableHead>
                  <TableHead className="text-gray-300">Lead Time (days)</TableHead>
                  <TableHead className="text-gray-300">Application Deadline</TableHead>
                  <TableHead className="text-gray-300">Label Upload Deadline</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow 
                    key={order.order_id} 
                    className="hover:bg-[#35353580] transition-colors focus:ring-[#35353580] border-[#6a6a6a80] cursor-pointer"
                    onClick={() => handleOrderClick(order.order_id)}
                  >
                    <TableCell className="text-gray-200">{order.order_id}</TableCell>
                    <TableCell className="text-gray-200">{order.leadtime}</TableCell>
                    <TableCell className="text-gray-200">
                      {new Date(order.deadline).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-gray-200">
                      {new Date(order.label_upload_deadline).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-gray-200">
                      {order.order_statuses[0]?.description || 'N/A'} {/* Handle array */}
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