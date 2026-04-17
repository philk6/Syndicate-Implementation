'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import {
  PageShell,
  PageHeader,
  SectionLabel,
  DsCard,
  MetricCard,
  DsStatusPill,
  DsTable,
  DsThead,
  DsTh,
  DsTr,
  DsTd,
  DsEmpty,
  DS,
} from '@/components/ui/ds';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { debounce } from 'lodash';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import { WeeklyCheckIn } from '@/components/WeeklyCheckIn';
import { getMissionControlData, type MissionControlData } from '@/lib/missionControl';
import { ShoppingCart, DollarSign, TrendingUp } from 'lucide-react';

interface Order {
  order_id: number;
  deadline: string;
  order_statuses: { description: string };
  total_amount?: number;
}

interface DashboardMetrics {
  totalOrders: number;
  totalInvestment: number;
  averageRoi: number | null;
}

interface ChartData {
  date: string;
  profit: number;
  invested_amount: number;
}

interface AggregateAllocationResult {
  time_period: string; // Assuming string, adjust if it's a Date object
  total_profit: number | null;
  total_invested_amount: number | null;
}

const chartConfig = {
  profit: {
    label: 'Profit',
    color: DS.orange,
  },
  invested_amount: {
    label: 'Invested Amount',
    color: DS.muted,
  },
} satisfies ChartConfig;

/** Map status description to a DS color */
function statusColor(description: string): string {
  const key = description?.toLowerCase() ?? '';
  if (key.includes('open') || key.includes('done') || key.includes('active')) return DS.teal;
  if (key.includes('closed') || key.includes('late')) return DS.red;
  if (key.includes('new') || key.includes('verified')) return DS.blue;
  if (key.includes('progress') || key.includes('pending') || key.includes('warehouse')) return DS.gold;
  if (key.includes('amazon')) return '#818cf8';
  if (key.includes('walmart')) return '#22d3ee';
  return DS.muted;
}

export default function UserDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({ totalOrders: 0, totalInvestment: 0, averageRoi: null });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [timeFrame, setTimeFrame] = useState<'7d' | '30d' | '3m' | '1y'>('30d');
  const [loading, setLoading] = useState(true);
  const [isCompanyPopupOpen, setIsCompanyPopupOpen] = useState(false);
  const [firstName, setFirstName] = useState<string>('');
  const [openOrderCount, setOpenOrderCount] = useState<number>(0);
  const [missionData, setMissionData] = useState<MissionControlData | null>(null);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  // Memoize the fetchChartData function to ensure stable identity
  const fetchChartData = useCallback(async (companyId: number, timeFrame: '7d' | '30d' | '3m' | '1y') => {
    // Determine the start date and date truncation based on time frame
    const now = new Date();
    let startDate: Date;
    let dateTrunc: string;
    switch (timeFrame) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateTrunc = 'day';
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateTrunc = 'day';
        break;
      case '3m':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        dateTrunc = 'week';
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        dateTrunc = 'month';
        break;
    }

    // Fetch allocation_results with profit and invested_amount
    const { data: allocationData, error: allocationError } = await supabase
      .rpc('aggregate_allocations_by_time', {
        p_company_id: companyId,
        p_date_trunc: dateTrunc,
        p_start_date: startDate.toISOString(),
      });

    if (allocationError) {
      console.error('Error fetching chart data:', allocationError.message, allocationError.details);
      setChartData([]);
    } else {
      console.log('Raw chart data:', allocationData); // Debug logging
      const processedData = allocationData.map((item: AggregateAllocationResult) => ({
        date: item.time_period,
        profit: item.total_profit || 0,
        invested_amount: item.total_invested_amount || 0,
      }));
      setChartData(processedData);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchDashboardData() {
      setLoading(true);

      // Ensure we have a valid user_id before making queries
      if (!user?.user_id) {
        console.error('No user_id available, waiting for auth to complete');
        setLoading(false);
        return;
      }

      // Fetch user's company_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id, firstname')
        .eq('user_id', user.user_id)
        .single();

      if (userError || !userData) {
        console.error('Error fetching user data:', userError?.message);
        // If this is a UUID error, it means user_id is malformed
        if (userError?.message?.includes('invalid input syntax for type uuid')) {
          console.error('Invalid user_id format:', user.user_id);
          // Force a re-authentication
          router.push('/login');
          return;
        }
        setLoading(false);
        return;
      }

      // Set the user's first name for the greeting
      if (userData.firstname) {
        const name = userData.firstname;
        setFirstName(name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());
      }

      const companyId = userData.company_id;

      // Fetch count of open orders (order_status_id = 1)
      const { count: openCount, error: openError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('order_status_id', 1);

      if (openError) {
        console.error('Error fetching open order count:', openError.message);
      } else {
        setOpenOrderCount(openCount || 0);
      }

      // Check if company_id is null and show popup
      if (!companyId) {
        setIsCompanyPopupOpen(true);
        setLoading(false);
        return;
      }

      // Fetch order_company data (orders, investment, ROI)
      const { data: orderCompanyData, error: orderCompanyError } = await supabase
        .from('order_company')
        .select(`
          order_id,
          max_investment,
          roi,
          orders(deadline, order_statuses(description), total_amount)
        `)
        .eq('company_id', companyId);

      if (orderCompanyError) {
        console.error('Error fetching order_company data:', orderCompanyError.message);
      } else {
        // Process orders
        const orders = orderCompanyData
          .map((oc) => {
            const orderData = Array.isArray(oc.orders) ? oc.orders[0] : oc.orders;

            if (!orderData) {
              console.warn(`Missing order data for order_company ${oc.order_id}`);
              return null;
            }

            const statusData = Array.isArray(orderData.order_statuses)
              ? orderData.order_statuses[0]
              : orderData.order_statuses;

            const mappedOrder: Order = {
              order_id: oc.order_id as number,
              deadline: orderData.deadline as string,
              order_statuses: {
                description: statusData?.description ?? 'Unknown',
              },
              total_amount: orderData.total_amount ?? undefined,
            };

            return mappedOrder;
          })
          .filter((order): order is Order => order !== null);

        // Calculate total orders
        const totalOrders = orders.length;

        // Calculate total investment
        const totalInvestment = orderCompanyData.reduce(
          (sum, item) => sum + (item.max_investment || 0),
          0
        );

        // Calculate average ROI
        const validRois = orderCompanyData
          .filter(item => item.roi != null)
          .map(item => item.roi as number);
        const averageRoi = validRois.length > 0
          ? validRois.reduce((sum, roi) => sum + roi, 0) / validRois.length
          : null;

        setMetrics({ totalOrders, totalInvestment, averageRoi });
        setRecentOrders(orders.sort((a, b) => b.order_id - a.order_id).slice(0, 5));
      }

      // Fetch chart data (profit and invested_amount)
      await fetchChartData(companyId, timeFrame);

      setLoading(false);
    }

    // Only fetch data if we have a valid user with user_id
    if (!user?.user_id) {
      console.log('Waiting for user data to be available...');
      return;
    }

    fetchDashboardData();
  }, [isAuthenticated, authLoading, router, user?.user_id, timeFrame, fetchChartData]);

  // Load mission data for active-phase detection on the weekly check-in widget
  useEffect(() => {
    if (!user?.user_id) return;
    let cancel = false;
    (async () => {
      try {
        const mc = await getMissionControlData(user.user_id);
        if (!cancel) setMissionData(mc);
      } catch (err) {
        console.warn('Failed to load mission data for dashboard:', err);
      }
    })();
    return () => { cancel = true; };
  }, [user?.user_id]);

  const activePhase = (() => {
    if (!missionData) return null;
    const phases = [...missionData.phases].sort((a, b) => a.sort_order - b.sort_order);
    for (const phase of phases) {
      if (phase.always_available) continue;
      const missions = missionData.missions.filter((m) => m.phase_id === phase.id);
      if (missions.length === 0) return phase;
      const allDone = missions.every(
        (m) => m.tasks.length > 0 && m.tasks.every((t) => t.progress?.status === 'approved'),
      );
      if (!allDone) return phase;
    }
    // All non-always-available phases complete → use phase 5 (ELEVATE)
    return phases.find((p) => p.always_available) ?? phases[phases.length - 1] ?? null;
  })();

  const handleRedirectToAccount = () => {
    setIsCompanyPopupOpen(false);
    router.push('/account');
  };

  // Create a debounced version of the timeFrame setter
  const handleTimeFrameChange = debounce((value: string) => {
    setTimeFrame(value as '7d' | '30d' | '3m' | '1y');
  }, 300);

  if (loading) {
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated) return null;

  return (
    <PageShell>
      {/* Page Header */}
      <PageHeader
        label="The Amazon Syndicate"
        title="DASHBOARD"
        subtitle={`Welcome back, ${firstName || 'User'}! Today there are ${openOrderCount} open order${openOrderCount !== 1 ? 's' : ''}.`}
        accent={DS.orange}
        right={
          <Link
            href="/orders"
            className="text-[11px] font-bold font-mono uppercase tracking-widest px-4 py-2 rounded-xl border transition-all hover:shadow-[0_0_14px_rgba(255,107,53,0.3)]"
            style={{
              backgroundColor: `${DS.orange}1a`,
              borderColor: `${DS.orange}55`,
              color: DS.orange,
            }}
          >
            View Orders
          </Link>
        }
      />

      {/* Weekly Check-In */}
      {user?.user_id && activePhase && (
        <WeeklyCheckIn
          userId={user.user_id}
          companyId={(user as { company_id?: number | null })?.company_id ?? null}
          phaseId={activePhase.id}
          phaseColor={activePhase.color}
          phaseName={activePhase.name}
        />
      )}

      {/* Metric Cards */}
      <SectionLabel accent={DS.orange}>Key Metrics</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Total Orders"
          value={metrics.totalOrders}
          accent={DS.orange}
          icon={<ShoppingCart size={18} />}
        />
        <MetricCard
          label="Total Investment"
          value={`$${metrics.totalInvestment.toLocaleString()}`}
          accent={DS.teal}
          icon={<DollarSign size={18} />}
        />
        <MetricCard
          label="Average ROI"
          value={metrics.averageRoi != null ? `${metrics.averageRoi.toFixed(2)}%` : 'N/A'}
          accent={DS.gold}
          icon={<TrendingUp size={18} />}
        />
      </div>

      {/* Area Chart: Profit and Investment Over Time */}
      <SectionLabel accent={DS.orange}>Performance</SectionLabel>
      <DsCard>
        <div className="flex items-center gap-2 space-y-0 border-b py-5 px-6 sm:flex-row" style={{ borderColor: DS.cardBorder }}>
          <div className="grid flex-1 gap-1 text-center sm:text-left">
            <h3 className="font-semibold text-white font-mono text-sm uppercase tracking-wider">
              Profit & Investment Over Time
            </h3>
            <p className="text-xs font-sans" style={{ color: DS.textDim }}>
              Showing total profit and invested amount for the selected time range
            </p>
          </div>
          <Select
            value={timeFrame}
            onValueChange={handleTimeFrameChange}
          >
            <SelectTrigger
              className="w-[160px] rounded-lg sm:ml-auto text-xs font-mono"
              style={{
                borderColor: DS.cardBorder,
                backgroundColor: DS.inputBg,
                color: DS.textDim,
              }}
              aria-label="Select time range"
            >
              <SelectValue placeholder="Last 30 days" />
            </SelectTrigger>
            <SelectContent
              className="rounded-xl border backdrop-blur-xl"
              style={{
                borderColor: DS.cardBorder,
                backgroundColor: 'rgba(10,10,15,0.95)',
              }}
            >
              <SelectItem value="7d" className="rounded-lg text-xs font-mono hover:bg-white/[0.02]">Last 7 days</SelectItem>
              <SelectItem value="30d" className="rounded-lg text-xs font-mono hover:bg-white/[0.02]">Last 30 days</SelectItem>
              <SelectItem value="3m" className="rounded-lg text-xs font-mono hover:bg-white/[0.02]">Last 3 months</SelectItem>
              <SelectItem value="1y" className="rounded-lg text-xs font-mono hover:bg-white/[0.02]">Last 1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="px-2 pt-4 pb-6 sm:px-6 sm:pt-6">
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={DS.orange} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={DS.orange} stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="fillInvested" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={DS.muted} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={DS.muted} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tick={{ fill: DS.textDim, fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });
                }}
              />
              <YAxis stroke="rgba(255,255,255,0.1)" tick={{ fill: DS.textDim, fontSize: 10, fontFamily: 'monospace' }} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      });
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="profit"
                type="natural"
                fill="url(#fillProfit)"
                stroke={DS.orange}
                strokeWidth={2}
                stackId="a"
              />
              <Area
                dataKey="invested_amount"
                type="natural"
                fill="url(#fillInvested)"
                stroke={DS.muted}
                strokeWidth={2}
                stackId="a"
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
          {chartData.length === 0 && (
            <p className="text-center mt-4 text-xs font-mono" style={{ color: DS.textDim }}>
              No data available for the selected time range.
            </p>
          )}
        </div>
      </DsCard>

      {/* Recent Orders Table */}
      <SectionLabel accent={DS.orange}>Recent Orders</SectionLabel>
      <DsTable>
        <DsThead>
          <DsTh>Order ID</DsTh>
          <DsTh>Status</DsTh>
          <DsTh>Deadline</DsTh>
          <DsTh>Total Amount</DsTh>
        </DsThead>
        <tbody>
          {recentOrders.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <DsEmpty
                  icon={<ShoppingCart size={24} />}
                  title="No Orders Yet"
                  body="Your recent orders will appear here once you have some."
                />
              </td>
            </tr>
          ) : (
            recentOrders.map((order) => (
              <DsTr key={order.order_id}>
                <DsTd className="font-mono tabular-nums">{order.order_id}</DsTd>
                <DsTd>
                  <DsStatusPill
                    label={order.order_statuses.description}
                    color={statusColor(order.order_statuses.description)}
                  />
                </DsTd>
                <DsTd className="font-mono text-xs tabular-nums">{new Date(order.deadline).toLocaleString()}</DsTd>
                <DsTd className="font-mono tabular-nums">${(order.total_amount || 0).toLocaleString()}</DsTd>
              </DsTr>
            ))
          )}
        </tbody>
      </DsTable>

      {/* Company Check Popup */}
      <AlertDialog open={isCompanyPopupOpen} onOpenChange={setIsCompanyPopupOpen}>
        <AlertDialogContent
          className="backdrop-blur-xl border shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]"
          style={{
            backgroundColor: 'rgba(10,10,15,0.95)',
            borderColor: DS.cardBorder,
            color: '#e5e5e5',
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-mono uppercase tracking-wider text-sm">
              Add Company Information
            </AlertDialogTitle>
            <AlertDialogDescription className="font-sans text-sm" style={{ color: DS.textDim }}>
              Your account is not linked to a company. Please add your company details to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="text-sm font-mono border-transparent hover:text-white"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: DS.textDim }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={handleRedirectToAccount}
                className="text-[11px] font-bold font-mono uppercase tracking-widest border transition-all hover:shadow-[0_0_18px_rgba(255,107,53,0.3)]"
                style={{
                  backgroundColor: `${DS.orange}1a`,
                  color: DS.orange,
                  borderColor: `${DS.orange}55`,
                }}
              >
                Go to Account
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
