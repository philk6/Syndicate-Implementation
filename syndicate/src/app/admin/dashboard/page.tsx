'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { supabase } from '../../../../lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Order {
  order_id: number;
  status: string;
  deadline: string;
  total_amount: number;
}

interface DashboardMetrics {
  totalOrders: number;
  totalRevenue: number;
  averageRoi: number | null;
}

interface RecentOrderQueryData {
  order_id: number;
  total_amount: number | null;
  deadline: string;
  order_statuses: { description: string } | null;
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({ totalOrders: 0, totalRevenue: 0, averageRoi: null });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || user?.role !== 'admin') {
      router.push('/login');
      return;
    }

    async function fetchDashboardData() {
      setLoading(true);

      // Fetch total orders
      const { count: totalOrders, error: ordersError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

      if (ordersError) {
        console.error('Error fetching total orders:', ordersError.message);
      }

      // Fetch total revenue (sum of total_amount from orders)
      const { data: revenueData, error: revenueError } = await supabase
        .from('orders')
        .select('total_amount')
        .not('total_amount', 'is', null);

      const totalRevenue = revenueData
        ? revenueData.reduce((sum, order) => sum + order.total_amount, 0)
        : 0;

      if (revenueError) {
        console.error('Error fetching total revenue:', revenueError.message);
      }

      // Fetch average ROI from order_company
      const { data: roiData, error: roiError } = await supabase
        .from('order_company')
        .select('roi')
        .not('roi', 'is', null);

      const averageRoi = roiData && roiData.length > 0
        ? roiData.reduce((sum, record) => sum + (record.roi || 0), 0) / roiData.length
        : null;

      if (roiError) {
        console.error('Error fetching average ROI:', roiError.message);
      }

      // Fetch recent orders (limit to 5 for display)
      const { data: ordersData, error: recentOrdersError } = await supabase
        .from('orders')
        .select(`
          order_id,
          total_amount,
          deadline,
          order_statuses!order_status_id(description)
        `)
        .order('created_at', { ascending: false })
        .limit(5) as { data: RecentOrderQueryData[] | null, error: PostgrestError | null };

      if (recentOrdersError) {
        console.error('Error fetching recent orders:', recentOrdersError.message);
      } else if (ordersData) {
        const processedOrders = ordersData.map(order => ({
          order_id: order.order_id,
          status: order.order_statuses?.description || 'N/A',
          deadline: order.deadline,
          total_amount: order.total_amount || 0,
        }));
        setRecentOrders(processedOrders);
      }

      setMetrics({
        totalOrders: totalOrders || 0,
        totalRevenue,
        averageRoi,
      });

      setLoading(false);
    }

    fetchDashboardData();
  }, [isAuthenticated, authLoading, router, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">Admin Dashboard</h1>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">{metrics.totalOrders}</p>
              <p className="text-sm text-gray-400">All orders processed</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">${metrics.totalRevenue.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Sum of order amounts</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Average ROI</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">
                {metrics.averageRoi != null ? metrics.averageRoi.toFixed(2) : 'N/A'}
              </p>
              <p className="text-sm text-gray-400">Across all company investments</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Orders Table */}
        <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
          <CardHeader>
            <CardTitle className="text-gray-300">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-[#2b2b2b] hover:bg-transparent">
                  <TableHead className="text-gray-300">Order ID</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                  <TableHead className="text-gray-300">Deadline</TableHead>
                  <TableHead className="text-gray-300">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-gray-400 text-center">
                      No recent orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((order) => (
                    <TableRow key={order.order_id} className="hover:bg-[#35353580] transition-colors border-[#2b2b2b]">
                      <TableCell className="text-gray-200">{order.order_id}</TableCell>
                      <TableCell className="text-gray-200">{order.status}</TableCell>
                      <TableCell className="text-gray-200">{new Date(order.deadline).toLocaleString()}</TableCell>
                      <TableCell className="text-gray-200">${order.total_amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}