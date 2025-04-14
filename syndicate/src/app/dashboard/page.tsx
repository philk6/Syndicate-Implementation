'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
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
import { Bar, BarChart, Pie, PieChart, CartesianGrid, XAxis, YAxis, Legend } from 'recharts';

interface Order {
  order_id: number;
  deadline: string;
  order_statuses: { description: string };
  total_amount?: number;
}

interface OrderStatusCount {
  status: string;
  count: number;
}

interface InvestmentDistribution {
  order_id: number;
  value: number;
}

export default function UserDashboardPage() {
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [ungatedProducts, setUngatedProducts] = useState(0);
  const [orderStatusData, setOrderStatusData] = useState<OrderStatusCount[]>([]);
  const [investmentData, setInvestmentData] = useState<InvestmentDistribution[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCompanyPopupOpen, setIsCompanyPopupOpen] = useState(false);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchDashboardData() {
      setLoading(true);

      // Fetch user's company_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('email', user?.email)
        .single();

      if (userError || !userData) {
        console.error('Error fetching user data:', userError);
        setLoading(false);
        return;
      }

      const companyId = userData.company_id;

      // Check if company_id is null and show popup
      if (!companyId) {
        setIsCompanyPopupOpen(true);
        setLoading(false);
        return; // Skip fetching dashboard data until company is linked
      }

      // Fetch total orders and recent orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('order_company')
        .select('order_id, orders(deadline, order_statuses(description), total_amount)')
        .eq('company_id', companyId);

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      } else {
        const orders = ordersData
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

        setTotalOrders(orders.length);
        setRecentOrders(orders.slice(0, 5));

        const statusCount = orders.reduce((acc: { [key: string]: number }, order) => {
          const status = order.order_statuses.description;
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {});
        setOrderStatusData(
          Object.entries(statusCount).map(([status, count]) => ({ status, count }))
        );
      }

      // Fetch total investment
      const { data: investmentData, error: investmentError } = await supabase
        .from('order_company')
        .select('order_id, max_investment')
        .eq('company_id', companyId);

      if (investmentError) {
        console.error('Error fetching investment:', investmentError);
      } else {
        const total = investmentData.reduce((sum, item) => sum + (item.max_investment || 0), 0);
        setTotalInvestment(total);
        setInvestmentData(
          investmentData.map(item => ({
            order_id: item.order_id,
            value: item.max_investment || 0,
          }))
        );
      }

      // Fetch ungated products
      const { data: productsData, error: productsError } = await supabase
        .from('order_products_company')
        .select('ungated')
        .eq('company_id', companyId);

      if (productsError) {
        console.error('Error fetching products:', productsError);
      } else {
        const ungatedCount = productsData.filter(p => p.ungated).length;
        setUngatedProducts(ungatedCount);
      }

      setLoading(false);
    }

    fetchDashboardData();
  }, [isAuthenticated, authLoading, router, user]);

  const handleRedirectToAccount = () => {
    setIsCompanyPopupOpen(false);
    router.push('/account');
  };

  const chartConfig = {
    count: { label: 'Orders', color: '#c8aa64' },
    value: { label: 'Investment' },
  };

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
              <p className="text-2xl font-bold text-[#c8aa64]">{totalOrders}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Total Investment</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">${totalInvestment.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Ungated Products</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">{ungatedProducts}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Bar Chart: Orders by Status */}
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Your Orders by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <BarChart data={orderStatusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#6a6a6a80" />
                  <XAxis dataKey="status" stroke="#d1d5db" />
                  <YAxis stroke="#d1d5db" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="#c8aa64" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Pie Chart: Investment Distribution by Order */}
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Investment Distribution by Order</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <PieChart>
                  <Pie
                    data={investmentData}
                    dataKey="value"
                    nameKey="order_id"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#c8aa64"
                    label={({ order_id, percent }) => `Order ${order_id} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

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
                {recentOrders.map((order) => (
                  <TableRow key={order.order_id} className="hover:bg-[#35353580] transition-colors border-[#2b2b2b]">
                    <TableCell className="text-gray-200">{order.order_id}</TableCell>
                    <TableCell className="text-gray-200">{order.order_statuses.description}</TableCell>
                    <TableCell className="text-gray-200">{new Date(order.deadline).toLocaleString()}</TableCell>
                    <TableCell className="text-gray-200">${(order.total_amount || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
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