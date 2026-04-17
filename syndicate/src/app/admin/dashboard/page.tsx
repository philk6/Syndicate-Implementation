'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { supabase } from '../../../../lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { AdminWeeklyCheckIns } from '@/components/AdminWeeklyCheckIns';
import {
  PageShell, PageHeader, SectionLabel, MetricCard, DsCard, DsStatusPill,
  DsTable, DsThead, DsTh, DsTr, DsTd, DsEmpty, DsCountPill, DS,
} from '@/components/ui/ds';
import { ShoppingCart, DollarSign, TrendingUp } from 'lucide-react';

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

      // Fetch total revenue + average ROI in parallel, capped for safety
      const [{ data: revenueData, error: revenueError }, { data: roiData, error: roiError }] = await Promise.all([
        supabase.from('orders').select('total_amount').not('total_amount', 'is', null).limit(500),
        supabase.from('order_company').select('roi').not('roi', 'is', null).limit(500),
      ]);

      const totalRevenue = revenueData
        ? revenueData.reduce((sum, order) => sum + order.total_amount, 0)
        : 0;

      if (revenueError) {
        console.error('Error fetching total revenue:', revenueError.message);
      }

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
    <PageShell>
      <PageHeader label="Admin Console" title="ADMIN DASHBOARD" />

      {/* Weekly Check-Ins */}
      <AdminWeeklyCheckIns />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Total Orders"
          value={metrics.totalOrders}
          sub="All orders processed"
          accent={DS.orange}
          icon={<ShoppingCart className="w-4 h-4" />}
        />
        <MetricCard
          label="Total Revenue"
          value={`$${metrics.totalRevenue.toLocaleString()}`}
          sub="Sum of order amounts"
          accent={DS.teal}
          icon={<DollarSign className="w-4 h-4" />}
        />
        <MetricCard
          label="Average ROI"
          value={metrics.averageRoi != null ? `${metrics.averageRoi.toFixed(2)}%` : 'N/A'}
          sub="Across all company investments"
          accent={DS.gold}
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      {/* Recent Orders Table */}
      <div>
        <SectionLabel accent={DS.orange}>
          Recent Orders <DsCountPill count={recentOrders.length} />
        </SectionLabel>

        {recentOrders.length === 0 ? (
          <DsEmpty
            icon={<ShoppingCart className="w-6 h-6" />}
            title="No Orders"
            body="No recent orders found."
          />
        ) : (
          <DsTable>
            <DsThead>
              <DsTh>Order ID</DsTh>
              <DsTh>Status</DsTh>
              <DsTh>Deadline</DsTh>
              <DsTh>Total Amount</DsTh>
            </DsThead>
            <tbody>
              {recentOrders.map((order) => (
                <DsTr key={order.order_id}>
                  <DsTd className="font-medium text-white">#{order.order_id}</DsTd>
                  <DsTd>
                    <DsStatusPill
                      label={order.status}
                      color={STATUS_COLOR[order.status.toLowerCase()] || DS.muted}
                    />
                  </DsTd>
                  <DsTd>{new Date(order.deadline).toLocaleString()}</DsTd>
                  <DsTd className="font-medium text-white">${order.total_amount.toLocaleString()}</DsTd>
                </DsTr>
              ))}
            </tbody>
          </DsTable>
        )}
      </div>
    </PageShell>
  );
}
