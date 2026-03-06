'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableCell, TableRow, TableHead } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
  hide_allocations: boolean;
}

interface AllocationResult {
  order_id: number;
  sequence: number;
  quantity: number;
  created_at: string;
  profit: number;
  invested_amount: number;
  order_products: {
    asin: string;
    description: string | null;
    price: number;
  };
  discounted_price: number | null;
}

// Type for the raw allocation data from the Supabase query
interface AllocationResultFromQuery extends AllocationResult {
  company_id: number;
}

interface OrderCompany {
  max_investment: number;
  roi: number | null;
  needs_review: boolean;
  has_discounts: boolean;
}

interface Receipt {
  receipt_id: number;
  file_name: string;
  file_path: string;
  uploaded_at: string;
}

// Type for order_products_company data
interface OrderProductCompanyData {
  sequence: number;
  company_id: number;
  discounted_price: number | null;
}

export default function HistoryOrderDetailPage() {
  const params = useParams();
  const orderId = parseInt(params.order_id as string);
  const [order, setOrder] = useState<Order | null>(null);
  const [allocations, setAllocations] = useState<AllocationResult[]>([]);
  const [orderCompany, setOrderCompany] = useState<OrderCompany | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
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

      // Fetch user's company_id and role
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id, role')
        .eq('user_id', user?.user_id)
        .single();

      if (userError || !userData.company_id) {
        console.error('Error fetching user data or no company_id:', userError?.message || 'No company_id found');
        setLoading(false);
        return;
      }

      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description), hide_allocations')
        .eq('order_id', orderId)
        .single() as { data: Order | null, error: PostgrestError | null };

      if (orderError) {
        console.error('Error fetching order:', orderError.message, orderError.details);
        setLoading(false);
        return;
      }

      // Fetch order_company data (max_investment, roi, needs_review, has_discounts)
      let hasDiscounts = false;
      if (userData.company_id) {
        const { data: companyOrderData, error: companyOrderError } = await supabase
          .from('order_company')
          .select('max_investment, roi, needs_review, has_discounts')
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id)
          .single();

        if (companyOrderError && companyOrderError.code !== 'PGRST116') {
          console.error('Error fetching order company data:', companyOrderError.message, companyOrderError.details);
        } else if (companyOrderData) {
          setOrderCompany({
            max_investment: companyOrderData.max_investment,
            roi: companyOrderData.roi,
            needs_review: companyOrderData.needs_review,
            has_discounts: companyOrderData.has_discounts,
          });
          hasDiscounts = companyOrderData.has_discounts;
        }
      }

      // Fetch allocation results for this company if not hidden or user is admin
      if (userData.company_id) {
        const { data: allocationData, error: allocationError } = await supabase
          .from('allocation_results')
          .select(`
            order_id,
            sequence,
            company_id,
            quantity,
            created_at,
            profit,
            invested_amount,
            order_products!allocation_results_order_id_sequence_fkey (
              asin,
              description,
              price
            )
          `)
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id)
          .returns<AllocationResultFromQuery[]>();

        if (allocationError) {
          console.error('Error fetching allocation results:', allocationError.message, allocationError.details);
        } else {
          console.log('Allocation data:', allocationData);

          // Fetch order_products_company data only if has_discounts is true
          let opcData: OrderProductCompanyData[] = [];
          if (hasDiscounts) {
            const { data, error: opcError } = await supabase
              .from('order_products_company')
              .select('sequence, company_id, discounted_price')
              .eq('order_id', orderId)
              .eq('company_id', userData.company_id)
              .not('discounted_price', 'is', null);

            if (opcError) {
              console.error('Error fetching order_products_company:', opcError.message, opcError.details);
            } else {
              opcData = data || [];
              console.log('Order products company data:', opcData);
            }
          } else {
            console.log('No discounts for this company (has_discounts = false)');
          }

          // Merge discounted_price into allocation results
          const discountMap: { [key: string]: number } = {};
          opcData.forEach((opc: OrderProductCompanyData) => {
            const sequence = String(opc.sequence);
            const companyId = String(opc.company_id);
            if (opc.discounted_price !== null) {
              discountMap[`${sequence}-${companyId}`] = opc.discounted_price;
            }
          });

          console.log('Discount map:', discountMap);

          const processedAllocations = allocationData?.map((alloc: AllocationResultFromQuery) => {
            const sequence = String(alloc.sequence);
            const companyId = String(alloc.company_id);
            const discountedPrice = discountMap[`${sequence}-${companyId}`] || null;
            return {
              ...alloc,
              order_products: alloc.order_products || { asin: 'Error', description: 'Missing product data', price: 0 },
              discounted_price: discountedPrice,
            };
          }) || [];

          console.log('Processed allocations:', processedAllocations);
          setAllocations(processedAllocations as AllocationResult[]);
        }
      }

      // Fetch receipts for this company and order
      if (userData.company_id) {
        const { data: receiptData, error: receiptError } = await supabase
          .from('order_receipts')
          .select('receipt_id, file_name, file_path, uploaded_at')
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id);

        if (receiptError) {
          console.error('Error fetching receipts:', receiptError.message);
        } else {
          setReceipts(receiptData || []);
        }
      }

      setOrder(orderData);
      setLoading(false);
    }

    fetchData();
  }, [orderId, isAuthenticated, authLoading, router, user]);

  const handleDownloadReceipt = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(filePath, 60);

    if (error) {
      console.error('Error generating signed URL:', error);
      alert('Failed to generate receipt view URL.');
    } else {
      window.open(data.signedUrl, '_blank');
    }
  };

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
            ← Back to History
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
                <Badge>{order.order_statuses?.description || 'N/A'}</Badge>
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
              {orderCompany && (
                <>
                  <div className="flex flex-col">
                    <span className="font-medium">Average ROI</span>
                    <span>{orderCompany.roi != null ? `${(orderCompany.roi).toFixed(2)}` : '-'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">Needs Review</span>
                    <span>{orderCompany.needs_review ? 'Yes' : 'No'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <Card className="mb-8 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] border-transparent">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-300">Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <p className="text-gray-400">No receipts available for this order.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-gray-300">File Name</TableHead>
                    <TableHead className="text-gray-300">Uploaded At</TableHead>
                    <TableHead className="text-gray-300">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.receipt_id} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                      <TableCell className="text-gray-200">{receipt.file_name}</TableCell>
                      <TableCell className="text-gray-200">{new Date(receipt.uploaded_at).toLocaleString()}</TableCell>
                      <TableCell className="text-gray-200">
                        <Button
                          onClick={() => handleDownloadReceipt(receipt.file_path)}
                          className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                        >
                          View / Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {allocations.length > 0 && (
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
                      <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">Quantity</th>
                      <th className="text-gray-300 w-[15%] h-12 px-4 text-left align-middle font-medium">Price</th>
                      <th className="text-gray-300 w-[15%] h-12 px-4 text-left align-middle font-medium">Profit</th>
                      <th className="text-gray-300 w-[30%] h-12 px-4 text-left align-middle font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((allocation) => {
                      const discountedPrice = allocation.discounted_price;
                      const originalPrice = allocation.order_products.price;
                      const discountPercentage = discountedPrice != null && originalPrice > 0
                        ? ((originalPrice - discountedPrice) / originalPrice * 100).toFixed(1)
                        : null;
                      return (
                        <tr key={`${allocation.order_id}-${allocation.sequence}`} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                          <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                            {allocation.order_products.asin}
                          </td>
                          <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                            {allocation.quantity}
                          </td>
                          <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                            {discountedPrice != null ? (
                              <div className="flex items-center gap-2">
                                <span>${discountedPrice.toFixed(2)}</span>
                                {discountPercentage != null && (
                                  <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
                                    -{discountPercentage}%
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              `$${originalPrice.toFixed(2)}`
                            )}
                          </td>
                          <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                            {allocation.profit != null ? `$${allocation.profit.toFixed(2)}` : '-'}
                          </td>
                          <td className="text-gray-200 p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                            {allocation.order_products.description || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {orderCompany != null && orderCompany.max_investment != null && (
          <div className="mb-4 flex flex-col items-end mt-14">
            <label className="text-gray-300 font-medium block mb-2">
              Maximum Investment ($)
            </label>
            <div className="text-gray-200 bg-[#1f1f1f] border border-[#6a6a6a80] rounded px-3 py-2 w-full max-w-xs">
              {orderCompany.max_investment.toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}