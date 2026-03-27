'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { supabase } from '../../../../lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import { GlassCard } from '@/components/ui/glass-card';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusPill } from '@/components/ui/status-pill';
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
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Admin Dashboard</h1>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <GlassCard className="p-6">
            <div className="mb-2">
              <h3 className="text-sm font-medium text-neutral-400">Total Orders</h3>
            </div>
            <div>
              <p className="text-2xl font-bold text-white tracking-tight">{metrics.totalOrders}</p>
              <p className="text-xs text-neutral-500 mt-1">All orders processed</p>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <div className="mb-2">
              <h3 className="text-sm font-medium text-neutral-400">Total Revenue</h3>
            </div>
            <div>
              <p className="text-2xl font-bold text-white tracking-tight">${metrics.totalRevenue.toLocaleString()}</p>
              <p className="text-xs text-neutral-500 mt-1">Sum of order amounts</p>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <div className="mb-2">
              <h3 className="text-sm font-medium text-neutral-400">Average ROI</h3>
            </div>
            <div>
              <p className="text-2xl font-bold text-white tracking-tight">
                {metrics.averageRoi != null ? metrics.averageRoi.toFixed(2) : 'N/A'}%
              </p>
              <p className="text-xs text-neutral-500 mt-1">Across all company investments</p>
            </div>
          </GlassCard>
        </div>

        {/* Recent Orders Table */}
        <GlassCard>
          <div className="p-6 pb-2">
            <h2 className="text-xl font-semibold text-white">Recent Orders</h2>
          </div>
          <div className="p-6 pt-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/[0.05] hover:bg-transparent">
                  <TableHead className="text-neutral-400">Order ID</TableHead>
                  <TableHead className="text-neutral-400">Status</TableHead>
                  <TableHead className="text-neutral-400">Deadline</TableHead>
                  <TableHead className="text-neutral-400">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-neutral-500 text-center py-8">
                      No recent orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((order) => (
                    <TableRow key={order.order_id} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.02]">
                      <TableCell className="text-neutral-200">#{order.order_id}</TableCell>
                      <TableCell className="text-neutral-200">
                        <StatusPill text={order.status} type={order.status} />
                      </TableCell>
                      <TableCell className="text-neutral-200">{new Date(order.deadline).toLocaleString()}</TableCell>
                      <TableCell className="text-white font-medium">${order.total_amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}