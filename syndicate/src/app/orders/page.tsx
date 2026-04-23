'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { useNetworkResilience } from '@/hooks/useNetworkResilience';
import { PostgrestError } from '@supabase/supabase-js';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  DS,
  PageShell,
  PageHeader,
  DsCountPill,
  DsTable,
  DsThead,
  DsTh,
  DsTr,
  DsTd,
  DsStatusPill,
  DsEmpty,
} from '@/components/ui/ds';
import { PackageOpen } from 'lucide-react';

interface Order {
  order_id: number;
  leadtime: string;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
  is_public: boolean;
}

/** Map order status text to a DS color */
function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'open':
    case 'active':
    case 'done':
      return DS.teal;
    case 'closed':
    case 'late':
      return DS.red;
    case 'pending':
    case 'progress':
    case 'warehouse':
      return DS.gold;
    case 'new':
      return DS.blue;
    default:
      return DS.orange;
  }
}

/** Return hours remaining until a deadline (negative = overdue) */
function hoursUntil(deadline: string): number {
  const deadlineDate = new Date(deadline + 'Z');
  if (isNaN(deadlineDate.getTime())) return Infinity;
  return (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60);
}

/** Return the appropriate color for a countdown value */
function countdownColor(hours: number): string {
  if (hours < 0) return DS.red;
  if (hours < 24) return DS.red;
  if (hours < 48) return DS.yellow;
  return '#e5e5e5'; // neutral-200 equivalent
}

/** Format a countdown string */
function formatCountdown(hours: number): string {
  if (hours < 0) return 'OVERDUE';
  if (hours < 1) return `${Math.round(hours * 60)}m left`;
  if (hours < 48) return `${Math.round(hours)}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { isAuthenticated, loading, user } = useAuth();
  const { withNetworkResilience } = useNetworkResilience();
  const router = useRouter();

  // Memoized function to fetch orders (RLS will handle accessibility)
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    setFetchError(null);

    try {
      // Use the wrapper's defaults now (10s / 0 retries). The previous
      // 30s × 3-retries override meant a broken connection produced a 60-90s
      // spinner before the page showed any error at all.
      await withNetworkResilience(async (signal) => {
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
          .neq('order_status_id', 3)
          .not('order_statuses.description', 'eq', 'Draft')
          .order('order_id', { ascending: false });

        if (signal) {
          query = query.abortSignal(signal);
        }

        const { data, error } = await query as { data: Order[] | null, error: PostgrestError | null };

        if (error) {
          console.error('Error fetching orders:', error);
          throw error;
        }
        setOrders(data || []);
      });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setFetchError(
        error instanceof Error ? error.message : 'Could not load orders.',
      );
    } finally {
      setLoadingOrders(false);
    }
  }, [withNetworkResilience]);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (!user?.user_id) return;

    const hasBuyersGroupAccess = user?.buyersgroup === true || user?.role === 'admin';
    if (!hasBuyersGroupAccess) {
      router.push('/dashboard');
      return;
    }

    fetchOrders();
  }, [isAuthenticated, loading, router, fetchOrders, user?.user_id, user?.buyersgroup, user?.role]);

  const handleOrderClick = useCallback((orderId: number) => {
    router.push(`/orders/${orderId}`);
  }, [router]);

  const orderRows = useMemo(() =>
    orders.map((order) => {
      const deadlineHrs = hoursUntil(order.deadline);
      const labelHrs = hoursUntil(order.label_upload_deadline);

      return (
        <DsTr key={order.order_id} onClick={() => handleOrderClick(order.order_id)}>
          <DsTd className="font-bold tabular-nums">
            <span style={{ color: DS.orange }}>#{order.order_id}</span>
          </DsTd>
          <DsTd>
            <DsStatusPill
              label={order.order_statuses?.description || 'N/A'}
              color={statusColor(order.order_statuses?.description)}
            />
          </DsTd>
          <DsTd>{order.leadtime}</DsTd>
          <DsTd>
            <div className="flex flex-col gap-0.5">
              <span className="text-neutral-300 text-xs">
                {new Date(order.deadline).toLocaleString()}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: countdownColor(deadlineHrs) }}
              >
                {formatCountdown(deadlineHrs)}
              </span>
            </div>
          </DsTd>
          <DsTd>
            <div className="flex flex-col gap-0.5">
              <span className="text-neutral-300 text-xs">
                {new Date(order.label_upload_deadline).toLocaleString()}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: countdownColor(labelHrs) }}
              >
                {formatCountdown(labelHrs)}
              </span>
            </div>
          </DsTd>
        </DsTr>
      );
    }),
    [orders, handleOrderClick]);

  if (loading || loadingOrders) {
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated) return null;

  return (
    <PageShell>
      <PageHeader
        label="Buyers Group"
        title="OPEN ORDERS"
        accent={DS.orange}
        right={<DsCountPill count={orders.length} accent={DS.orange} />}
      />

      {fetchError ? (
        <div
          className="rounded-2xl border p-6 space-y-3"
          style={{ borderColor: `${DS.red}44`, backgroundColor: `${DS.red}08` }}
        >
          <div>
            <p className="text-sm font-mono uppercase tracking-widest text-rose-400">
              Could not load orders
            </p>
            <p className="text-xs text-neutral-400 mt-1 font-sans">{fetchError}</p>
          </div>
          <button
            onClick={() => fetchOrders()}
            className="text-[11px] font-bold font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border"
            style={{ borderColor: `${DS.red}66`, color: DS.red, backgroundColor: `${DS.red}1a` }}
          >
            Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <DsEmpty
          icon={<PackageOpen size={28} />}
          title="No Orders"
          body="There are no open orders available right now. Check back later."
        />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>Order ID</DsTh>
            <DsTh>Status</DsTh>
            <DsTh>Lead Time (days)</DsTh>
            <DsTh>Application Deadline</DsTh>
            <DsTh>Label Upload Deadline</DsTh>
          </DsThead>
          <tbody>{orderRows}</tbody>
        </DsTable>
      )}
    </PageShell>
  );
}
