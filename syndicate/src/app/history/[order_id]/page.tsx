'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusPill } from '@/components/ui/status-pill';
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableRow,
  TableHead
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  FileText,
  Clock,
  TrendingUp,
  Package,
  DollarSign,
  Calendar,
  Eye
} from 'lucide-react';

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

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description), hide_allocations')
        .eq('order_id', orderId)
        .single() as { data: Order | null, error: PostgrestError | null };

      if (orderError) {
        console.error('Error fetching order:', orderError.message);
        setLoading(false);
        return;
      }

      let hasDiscounts = false;
      if (userData.company_id) {
        const { data: companyOrderData, error: companyOrderError } = await supabase
          .from('order_company')
          .select('max_investment, roi, needs_review, has_discounts')
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id)
          .single();

        if (companyOrderError && companyOrderError.code !== 'PGRST116') {
          console.error('Error fetching order company data:', companyOrderError.message);
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
          console.error('Error fetching allocation results:', allocationError.message);
        } else {
          let opcData: OrderProductCompanyData[] = [];
          if (hasDiscounts) {
            const { data, error: opcError } = await supabase
              .from('order_products_company')
              .select('sequence, company_id, discounted_price')
              .eq('order_id', orderId)
              .eq('company_id', userData.company_id)
              .not('discounted_price', 'is', null);

            if (opcError) {
              console.error('Error fetching order_products_company:', opcError.message);
            } else {
              opcData = data || [];
            }
          }

          const discountMap: { [key: string]: number } = {};
          opcData.forEach((opc: OrderProductCompanyData) => {
            const sequence = String(opc.sequence);
            const companyId = String(opc.company_id);
            if (opc.discounted_price !== null) {
              discountMap[`${sequence}-${companyId}`] = opc.discounted_price;
            }
          });

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

          setAllocations(processedAllocations as AllocationResult[]);
        }
      }

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
    } else {
      window.open(data.signedUrl, '_blank');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
          <p className="text-neutral-500 animate-pulse font-medium">Fetching secure order details...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!order) return (
    <div className="min-h-screen p-6 w-full flex items-center justify-center">
      <GlassCard className="max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-4 tracking-tight">Access Denied or Order Not Found</h1>
        <p className="text-neutral-500 mb-8 leading-relaxed">The requested order does not exist or you don't have the required permissions to view it.</p>
        <Link
          href="/history"
          className="inline-flex items-center px-6 py-2 bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 rounded-xl transition-all duration-300"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Return to History
        </Link>
      </GlassCard>
    </div>
  );

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center mb-6">
          <Link
            href="/history"
            className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center w-fit"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to History
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Order Details</h1>
            <p className="text-neutral-500 mt-1 font-mono text-sm">#{order.order_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill
              text={order.order_statuses?.description || 'N/A'}
              type={order.order_statuses?.description?.toLowerCase() || 'pending'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <GlassCard className="p-6 lg:col-span-2">
            <div className="flex items-center mb-6 border-b border-white/[0.05] pb-4">
              <Calendar className="mr-3 h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-white">Scheduling & Terms</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="text-neutral-500 text-xs font-semibold uppercase tracking-wider block mb-1">Application Deadline</label>
                  <div className="text-white font-medium flex items-center">
                    <Clock className="mr-2 h-3.5 w-3.5 text-neutral-400" />
                    {new Date(order.deadline).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="text-neutral-500 text-xs font-semibold uppercase tracking-wider block mb-1">Label Upload Deadline</label>
                  <div className="text-white font-medium flex items-center">
                    <Clock className="mr-2 h-3.5 w-3.5 text-neutral-400" />
                    {new Date(order.label_upload_deadline).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-neutral-500 text-xs font-semibold uppercase tracking-wider block mb-1">Lead Time</label>
                  <div className="text-white font-medium flex items-center">
                    <Package className="mr-2 h-3.5 w-3.5 text-neutral-400" />
                    {order.leadtime} Days
                  </div>
                </div>
                {orderCompany && (
                  <div>
                    <label className="text-neutral-500 text-xs font-semibold uppercase tracking-wider block mb-1">Estimated ROI</label>
                    <div className="text-emerald-400 font-bold flex items-center">
                      <TrendingUp className="mr-2 h-3.5 w-3.5" />
                      {orderCompany.roi != null ? `${(orderCompany.roi).toFixed(2)}` : 'Calculated at allocation'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center mb-6 border-b border-white/[0.05] pb-4">
              <DollarSign className="mr-3 h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-white">Investment Limit</h2>
            </div>
            {orderCompany ? (
              <div className="flex flex-col h-[calc(100%-4rem)] justify-center space-y-4">
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 text-center">
                  <div className="text-neutral-500 text-xs font-semibold uppercase tracking-wider mb-2">Maximum Commitment</div>
                  <div className="text-4xl font-bold text-white tracking-tight">
                    ${orderCompany.max_investment.toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${orderCompany.needs_review ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                    {orderCompany.needs_review ? 'Requires Review' : 'Commitment Verified'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-neutral-500 italic text-center text-sm">
                No commitment data found
              </div>
            )}
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 gap-6 mb-8">
          <GlassCard className="p-0 overflow-hidden">
            <div className="p-6 border-b border-white/[0.05]">
              <h2 className="text-lg font-semibold text-white flex items-center">
                <FileText className="mr-2 h-5 w-5 text-amber-500" />
                Proof of Purchase (Receipts)
              </h2>
            </div>
            {receipts.length === 0 ? (
              <div className="p-12 text-center text-neutral-500 italic">
                No receipts have been issued for this order commit yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Filename</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Uploaded At</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.receipt_id} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                      <TableCell className="py-4 px-6 font-medium text-neutral-200">
                        <div className="flex items-center">
                          <FileText className="h-4 w-4 mr-3 text-neutral-500" />
                          {receipt.file_name}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-neutral-400">
                        {new Date(receipt.uploaded_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-4 px-6 text-right">
                        <Button
                          size="sm"
                          onClick={() => handleDownloadReceipt(receipt.file_path)}
                          className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
                        >
                          <Eye className="h-4 w-4 mr-2" /> View Document
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </GlassCard>
        </div>

        {allocations.length > 0 && (
          <GlassCard className="p-0 overflow-hidden">
            <div className="p-6 border-b border-white/[0.05]">
              <h2 className="text-lg font-semibold text-white flex items-center">
                <Package className="mr-2 h-5 w-5 text-amber-500" />
                Final Allocations & Distribution
              </h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">ASIN</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Quantity</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6 text-center">Price Arrangement</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Projected Profit</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Product Information</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((allocation) => {
                    const discountedPrice = allocation.discounted_price;
                    const originalPrice = allocation.order_products.price;
                    const discountPercentage = discountedPrice != null && originalPrice > 0
                      ? ((originalPrice - discountedPrice) / originalPrice * 100).toFixed(1)
                      : null;
                    return (
                      <TableRow key={`${allocation.order_id}-${allocation.sequence}`} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                        <TableCell className="py-4 px-6 font-mono text-sm text-neutral-300">
                          {allocation.order_products.asin}
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <span className="bg-white/[0.05] px-3 py-1 rounded-lg text-white font-medium">
                            {allocation.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <div className="flex flex-col items-center">
                            {discountedPrice != null ? (
                              <>
                                <span className="text-white font-bold">${discountedPrice.toFixed(2)}</span>
                                {discountPercentage != null && (
                                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">
                                    -{discountPercentage}% SAVING
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-neutral-400">${originalPrice.toFixed(2)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <span className="text-emerald-400 font-mono font-bold">
                            {allocation.profit != null ? `+$${allocation.profit.toFixed(2)}` : '-'}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-6 max-w-[200px]">
                          <div className="text-neutral-500 text-xs truncate italic">
                            {allocation.order_products.description || 'No additional details available'}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}