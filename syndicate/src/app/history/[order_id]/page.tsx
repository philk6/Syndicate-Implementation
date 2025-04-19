'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
}

interface AllocationResult {
  order_id: number;
  sequence: number;
  quantity: number;
  needs_review: boolean;
  created_at: string;
  order_products: {
    asin: string;
    description: string | null;
    roi: number | null; // ROI from order_products
  };
}

export default function HistoryOrderDetailPage() {
  const params = useParams();
  const orderId = parseInt(params.order_id as string);
  const [order, setOrder] = useState<Order | null>(null);
  const [allocations, setAllocations] = useState<AllocationResult[]>([]);
  const [maxInvestment, setMaxInvestment] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchData() {
      setLoading(true);

      // Fetch user's company_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('email', user?.email)
        .single();

      if (userError || !userData.company_id) {
        console.error('Error fetching user data or no company_id:', userError?.message || 'No company_id found');
        setLoading(false);
        return;
      }

      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description)')
        .eq('order_id', orderId)
        .single() as { data: Order | null, error: PostgrestError | null };

      if (orderError) {
        console.error('Error fetching order:', orderError.message, orderError.details);
        setLoading(false);
        return;
      }

      // Fetch allocation results for this company
      if (userData.company_id) {
        const { data: allocationData, error: allocationError } = await supabase
          .from('allocation_results')
          .select(`
            order_id,
            sequence,
            quantity,
            needs_review,
            created_at,
            order_products!allocation_results_order_id_sequence_fkey (
              asin,
              description,
              roi
            )
          `)
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .returns<any[]>();

        if (allocationError) {
          console.error('Error fetching allocation results:', allocationError.message, allocationError.details);
        } else {
          console.log('Raw allocation data:', allocationData); // Debug logging
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const processedAllocations = allocationData?.map((alloc: any) => ({
            ...alloc,
            order_products: alloc.order_products || { asin: 'Error', description: 'Missing product data', roi: null },
            // ROI is now sourced from order_products
          })) || [];
          setAllocations(processedAllocations as AllocationResult[]);
        }
      }

      // Fetch existing max_investment from order_company
      if (userData.company_id) {
        const { data: companyOrderData, error: companyOrderError } = await supabase
          .from('order_company')
          .select('max_investment')
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id)
          .single();

        if (companyOrderError && companyOrderError.code !== 'PGRST116') {
          console.error('Error fetching order company data:', companyOrderError.message, companyOrderError.details);
        } else if (companyOrderData) {
          setMaxInvestment(companyOrderData.max_investment);
        }
      }

      setOrder(orderData);
      setLoading(false);
    }

    fetchData();
  }, [orderId, isAuthenticated, authLoading, router, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (!order) return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="mx-auto">
        <div className="flex items-center mb-6">
          <Link href="/history" className="text-blue-500 hover:text-blue-400 mr-4">
            &larr; Back to History
          </Link>
          <h1 className="text-3xl font-bold text-white">Order Not Found</h1>
        </div>
        <p className="text-gray-400">The requested order does not exist or you don&apos;t have permission to view it.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6 w-full">
      <div className="w-full">
        <div className="flex items-center mb-6">
          <Link href="/history" className="text-[#c8aa64] hover:text-[#9d864e] mr-4">
            ← Back to History
          </Link>
        </div>

        <div className="flex items-center mb-6">
          <h1 className="text-3xl font-bold text-[#bfbfbf]">Order #{order.order_id}</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 mb-8 w-full">
          <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full">
            <div className="flex flex-wrap gap-6 text-gray-300">
              <div className="flex flex-col">
                <span className="font-medium">Status</span>
                <Badge variant="outline" className='bg-[#c8aa64] text-[#242424]'>{order.order_statuses?.description || 'N/A'}</Badge>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Lead Time</span>
                <span>{order.leadtime} days</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Deadline</span>
                <span>{new Date(order.deadline).toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Label Upload Deadline</span>
                <span>{new Date(order.label_upload_deadline).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full overflow-x-auto">
          <h2 className="text-xl font-semibold text-gray-300 mb-4">Your Allocations</h2>
          {allocations.length === 0 ? (
            <p className="text-gray-400">No allocations found for this order.</p>
          ) : (
            <div className="w-full">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="border-[#2B2B2B] hover:bg-transparent">
                    <th className="text-gray-300 w-[15%] h-12 px-4 text-left align-middle font-medium">ASIN</th>
                    <th className="text-gray-300 w-[15%] h-12 px-4 text-left align-middle font-medium">Quantity</th>
                    <th className="text-gray-300 w-[15%] h-12 px-4 text-left align-middle font-medium">ROI</th>
                    <th className="text-gray-300 w-[15%] h-12 px-4 text-left align-middle font-medium">Needs Review</th>
                    <th className="text-gray-300 w-[25%] h-12 px-4 text-left align-middle font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((allocation) => (
                    <tr key={`${allocation.order_id}-${allocation.sequence}`} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                      <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                        {allocation.order_products.asin}
                      </td>
                      <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                        {allocation.quantity}
                      </td>
                      <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                        {allocation.order_products.roi != null ? allocation.order_products.roi.toFixed(2) : '-'}
                      </td>
                      <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                        {allocation.needs_review ? 'Yes' : 'No'}
                      </td>
                      <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                        {allocation.order_products.description || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {maxInvestment !== null && (
          <div className="mb-4 flex flex-col items-end mt-14">
            <label className="text-gray-300 font-medium block mb-2">
              Maximum Investment ($)
            </label>
            <div className="text-gray-200 bg-[#1f1f1f] border border-[#6a6a6a80] rounded px-3 py-2 w-full max-w-xs">
              {maxInvestment.toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}