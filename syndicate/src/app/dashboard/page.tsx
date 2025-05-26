'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    color: '#c8aa64',
  },
  invested_amount: {
    label: 'Invested Amount',
    color: '#6a6a6a',
  },
} satisfies ChartConfig;

export default function UserDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({ totalOrders: 0, totalInvestment: 0, averageRoi: null });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [timeFrame, setTimeFrame] = useState<'7d' | '30d' | '3m' | '1y'>('30d');
  const [loading, setLoading] = useState(true);
  const [isCompanyPopupOpen, setIsCompanyPopupOpen] = useState(false);
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
        .select('company_id')
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

      const companyId = userData.company_id;

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
        setRecentOrders(orders.slice(0, 5));
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

  const handleRedirectToAccount = () => {
    setIsCompanyPopupOpen(false);
    router.push('/account');
  };

  // Create a debounced version of the timeFrame setter 
  const handleTimeFrameChange = debounce((value: string) => {
    setTimeFrame(value as '7d' | '30d' | '3m' | '1y');
  }, 300);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-[#d1d5db] mb-6">Dashboard</h1>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Your Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">{metrics.totalOrders}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Total Investment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">${metrics.totalInvestment.toLocaleString()}</p>
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
            </CardContent>
          </Card>
        </div>

        {/* Area Chart: Profit and Investment Over Time */}
        <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80] mb-8">
          <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
            <div className="grid flex-1 gap-1 text-center sm:text-left">
              <CardTitle>Profit and Investment Over Time</CardTitle>
              <CardDescription>
                Showing total profit and invested amount for the selected time range
              </CardDescription>
            </div>
            <Select 
              value={timeFrame} 
              onValueChange={handleTimeFrameChange}
            >
              <SelectTrigger className="w-[160px] rounded-lg sm:ml-auto border-[#6a6a6a80]" aria-label="Select time range">
                <SelectValue placeholder="Last 30 days" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
                <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
                <SelectItem value="3m" className="rounded-lg">Last 3 months</SelectItem>
                <SelectItem value="1y" className="rounded-lg">Last 1 year</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
            <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c8aa64" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#c8aa64" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="fillInvested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6a6a6a" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#6a6a6a" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#6a6a6a80" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    });
                  }}
                />
                <YAxis stroke="#d1d5db" />
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
                  stroke="#c8aa64"
                  stackId="a"
                />
                <Area
                  dataKey="invested_amount"
                  type="natural"
                  fill="url(#fillInvested)"
                  stroke="#6a6a6a"
                  stackId="a"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
            {chartData.length === 0 && (
              <p className="text-gray-400 text-center mt-4">No data available for the selected time range.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders Table */}
        <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
          <CardHeader>
            <CardTitle className="text-gray-300">Your Recent Orders</CardTitle>
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
                      <TableCell className="text-gray-200">{order.order_statuses.description}</TableCell>
                      <TableCell className="text-gray-200">{new Date(order.deadline).toLocaleString()}</TableCell>
                      <TableCell className="text-gray-200">${(order.total_amount || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Company Check Popup */}
        <AlertDialog open={isCompanyPopupOpen} onOpenChange={setIsCompanyPopupOpen}>
          <AlertDialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
            <AlertDialogHeader>
              <AlertDialogTitle>Add Company Information</AlertDialogTitle>
              <AlertDialogDescription>
                Your account is not linked to a company. Please add your company details to continue.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-[#2b2b2b] text-gray-300 border-[#6a6a6a80] hover:bg-[#353535]">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  onClick={handleRedirectToAccount}
                  className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                >
                  Go to Account
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}