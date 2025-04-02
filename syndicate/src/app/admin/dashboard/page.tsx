'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
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
import { Bar, BarChart, Pie, PieChart, CartesianGrid, XAxis, YAxis, Legend } from 'recharts';

// Dummy Data (replace with real data fetches if needed)
const orderStatusData = [
  { status: 'Open', count: 15 },
  { status: 'Closed', count: 8 },
  { status: 'Pending', count: 5 },
];

const productDistributionData = [
  { name: 'Company A', value: 40 },
  { name: 'Company B', value: 30 },
  { name: 'Company C', value: 20 },
  { name: 'Unassigned', value: 10 },
];

const recentOrders = [
  { order_id: 1, status: 'Open', deadline: '2025-04-15T00:00:00Z', total_amount: 1500 },
  { order_id: 2, status: 'Closed', deadline: '2025-03-20T00:00:00Z', total_amount: 2000 },
  { order_id: 3, status: 'Pending', deadline: '2025-04-10T00:00:00Z', total_amount: 800 },
];

// Chart Configurations
const orderChartConfig = {
  count: {
    label: 'Orders',
    color: '#c8aa64', // Gold color from your theme
  },
};

const productChartConfig = {
  value: {
    label: 'Products',
  },
};

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated || user?.role !== 'admin') {
      router.push('/login');
      return;
    }

    // Simulate data fetch (replace with real Supabase calls if desired)
    setTimeout(() => setLoading(false), 500); // Dummy delay
  }, [isAuthenticated, authLoading, router, user]);

  if (authLoading || loading) {
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
              <p className="text-2xl font-bold text-[#c8aa64]">28</p>
              <p className="text-sm text-gray-400">+5% from last month</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">$45,678</p>
              <p className="text-sm text-gray-400">+12% from last month</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Active Companies</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#c8aa64]">12</p>
              <p className="text-sm text-gray-400">+2 this month</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Bar Chart: Orders by Status */}
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Orders by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={orderChartConfig} className="h-[300px]">
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

          {/* Pie Chart: Product Distribution by Company */}
          <Card className="bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-[#6a6a6a80]">
            <CardHeader>
              <CardTitle className="text-gray-300">Product Distribution by Company</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={productChartConfig} className="h-[300px]">
                <PieChart>
                  <Pie
                    data={productDistributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#c8aa64"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
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
                {recentOrders.map((order) => (
                  <TableRow key={order.order_id} className="hover:bg-[#35353580] transition-colors border-[#2b2b2b]">
                    <TableCell className="text-gray-200">{order.order_id}</TableCell>
                    <TableCell className="text-gray-200">{order.status}</TableCell>
                    <TableCell className="text-gray-200">{new Date(order.deadline).toLocaleString()}</TableCell>
                    <TableCell className="text-gray-200">${order.total_amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}