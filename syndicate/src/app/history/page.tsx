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
import { StatusPill } from '@/components/ui/status-pill';
import { GlassCard } from '@/components/ui/glass-card';
import { History, Clock, ArrowRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

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
          .order('order_id', { ascending: false }) as { data: Order[] | null, error: PostgrestError | null };

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

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen p-6 w-full relative">
      <div className="max-w-7xl mx-auto z-10 relative">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center">
            <History className="mr-3 h-8 w-8 text-amber-500" />
            Order History
          </h1>
        </div>

        <GlassCard className="p-0 overflow-hidden">
          <div className="p-6 border-b border-white/[0.05]">
            <h2 className="text-lg font-semibold text-white">Your Orders</h2>
            <p className="text-neutral-500 text-sm">View and manage your past and active orders</p>
          </div>

          {loadingOrders ? (
            <div className="p-12 flex items-center justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 italic">
              No orders found in your history.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">ID</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Status</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Lead Time</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Application Deadline</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Upload Deadline</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.order_id}
                      className="hover:bg-white/[0.02] transition-colors border-white/[0.02] cursor-pointer group"
                      onClick={() => handleOrderClick(order.order_id)}
                    >
                      <TableCell className="py-4 px-6 font-mono text-sm text-amber-500/80">#{order.order_id}</TableCell>
                      <TableCell className="py-4 px-6">
                        <StatusPill
                          text={order.order_statuses?.description || 'N/A'}
                          type={order.order_statuses?.description?.toLowerCase() || 'pending'}
                        />
                      </TableCell>
                      <TableCell className="py-4 px-6 text-neutral-300 font-medium">{order.leadtime} Days</TableCell>
                      <TableCell className="py-4 px-6">
                        <div className="space-y-2">
                          <div className="text-neutral-400 text-xs flex items-center">
                            <Clock className="h-3 w-3 mr-1.5 text-neutral-500" />
                            {new Date(order.deadline).toLocaleDateString()}
                          </div>
                          <div className="w-24 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${calculateProgress(order.deadline) < 30 ? 'bg-rose-500/50' :
                                  calculateProgress(order.deadline) < 70 ? 'bg-amber-500/50' : 'bg-emerald-500/50'
                                }`}
                              style={{ width: `${calculateProgress(order.deadline)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6">
                        <div className="space-y-2">
                          <div className="text-neutral-400 text-xs flex items-center">
                            <Clock className="h-3 w-3 mr-1.5 text-neutral-500" />
                            {new Date(order.label_upload_deadline).toLocaleDateString()}
                          </div>
                          <div className="w-24 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${calculateProgress(order.label_upload_deadline) < 30 ? 'bg-rose-500/50' :
                                  calculateProgress(order.label_upload_deadline) < 70 ? 'bg-amber-500/50' : 'bg-emerald-500/50'
                                }`}
                              style={{ width: `${calculateProgress(order.label_upload_deadline)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-right">
                        <div className="inline-flex items-center text-amber-500 font-medium text-sm group-hover:translate-x-1 transition-transform">
                          Details <ArrowRight className="ml-1.5 h-4 w-4" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}