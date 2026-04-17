'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import {
  PageShell,
  PageHeader,
  SectionLabel,
  DsTable,
  DsThead,
  DsTh,
  DsTr,
  DsTd,
  DsStatusPill,
  DsEmpty,
  DsCountPill,
  DS,
} from '@/components/ui/ds';
import { History, Clock, ArrowRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
}

/* Map order status text to a DS colour */
function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('delivered')) return '#22c55e';
  if (s.includes('active') || s.includes('open') || s.includes('accepting')) return DS.teal;
  if (s.includes('cancel') || s.includes('reject')) return DS.red;
  if (s.includes('pending') || s.includes('review')) return DS.yellow;
  return DS.orange;
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
    if (isNaN(deadlineDate.getTime())) return 0;
    const diffMs = deadlineDate.getTime() - now.getTime();
    const daysLeft = diffMs / (1000 * 60 * 60 * 24);
    if (daysLeft > 5) return 100;
    if (daysLeft >= 0) return (daysLeft / 5) * 100;
    return 0;
  };

  const progressColor = (pct: number) =>
    pct < 30 ? DS.red : pct < 70 ? DS.yellow : DS.teal;

  if (!isAuthenticated) return null;

  return (
    <PageShell>
      <PageHeader
        label="Syndicate"
        title="ORDER HISTORY"
        subtitle="View and manage your past and active orders"
        right={
          orders.length > 0 ? <DsCountPill count={orders.length} accent={DS.orange} /> : undefined
        }
      />

      <SectionLabel accent={DS.orange}>Your Orders</SectionLabel>

      {loadingOrders ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="md" />
        </div>
      ) : orders.length === 0 ? (
        <DsEmpty
          icon={<History className="w-7 h-7" />}
          title="No Orders"
          body="No orders found in your history."
        />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>ID</DsTh>
            <DsTh>Status</DsTh>
            <DsTh>Lead Time</DsTh>
            <DsTh>Application Deadline</DsTh>
            <DsTh>Upload Deadline</DsTh>
            <DsTh className="text-right">Actions</DsTh>
          </DsThead>
          <tbody>
            {orders.map((order) => {
              const status = order.order_statuses?.description || 'N/A';
              const deadlinePct = calculateProgress(order.deadline);
              const uploadPct = calculateProgress(order.label_upload_deadline);
              return (
                <DsTr
                  key={order.order_id}
                  onClick={() => handleOrderClick(order.order_id)}
                >
                  <DsTd>
                    <span className="font-mono font-bold" style={{ color: DS.orange }}>
                      #{order.order_id}
                    </span>
                  </DsTd>
                  <DsTd>
                    <DsStatusPill label={status} color={statusColor(status)} />
                  </DsTd>
                  <DsTd>
                    <span className="text-neutral-200 font-medium">{order.leadtime} Days</span>
                  </DsTd>
                  <DsTd>
                    <div className="space-y-1.5">
                      <div className="text-neutral-400 text-[11px] flex items-center">
                        <Clock className="h-3 w-3 mr-1.5 text-neutral-500" />
                        {new Date(order.deadline).toLocaleDateString()}
                      </div>
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="h-full transition-all duration-500 rounded-full"
                          style={{
                            width: `${deadlinePct}%`,
                            backgroundColor: progressColor(deadlinePct),
                            boxShadow: `0 0 6px ${progressColor(deadlinePct)}66`,
                          }}
                        />
                      </div>
                    </div>
                  </DsTd>
                  <DsTd>
                    <div className="space-y-1.5">
                      <div className="text-neutral-400 text-[11px] flex items-center">
                        <Clock className="h-3 w-3 mr-1.5 text-neutral-500" />
                        {new Date(order.label_upload_deadline).toLocaleDateString()}
                      </div>
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="h-full transition-all duration-500 rounded-full"
                          style={{
                            width: `${uploadPct}%`,
                            backgroundColor: progressColor(uploadPct),
                            boxShadow: `0 0 6px ${progressColor(uploadPct)}66`,
                          }}
                        />
                      </div>
                    </div>
                  </DsTd>
                  <DsTd className="text-right">
                    <span
                      className="inline-flex items-center text-[11px] font-bold font-mono uppercase tracking-widest transition-transform group-hover:translate-x-1"
                      style={{ color: DS.orange }}
                    >
                      Details <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </span>
                  </DsTd>
                </DsTr>
              );
            })}
          </tbody>
        </DsTable>
      )}
    </PageShell>
  );
}
