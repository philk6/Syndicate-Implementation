'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  PageShell,
  PageHeader,
  SectionLabel,
  DsCard,
  MetricCard,
  DsTable,
  DsThead,
  DsTh,
  DsTr,
  DsTd,
  DsStatusPill,
  DsButton,
  DsEmpty,
  DS,
} from '@/components/ui/ds';
import {
  ArrowLeft,
  FileText,
  Clock,
  TrendingUp,
  DollarSign,
  Calendar,
  Eye,
} from 'lucide-react';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';

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

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('delivered')) return '#22c55e';
  if (s.includes('active') || s.includes('open') || s.includes('accepting')) return DS.teal;
  if (s.includes('cancel') || s.includes('reject')) return DS.red;
  if (s.includes('pending') || s.includes('review')) return DS.yellow;
  return DS.orange;
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
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated) return null;

  if (!order) return (
    <PageShell>
      <div className="flex items-center justify-center min-h-[60vh]">
        <DsCard className="max-w-md p-8 text-center" accent={DS.red}>
          <h1 className="text-2xl font-bold text-white mb-4 tracking-tight">Access Denied or Order Not Found</h1>
          <p className="text-neutral-500 mb-8 leading-relaxed text-sm font-sans">
            The requested order does not exist or you don&apos;t have the required permissions to view it.
          </p>
          <Link href="/history">
            <DsButton variant="secondary">
              <ArrowLeft className="h-3.5 w-3.5" /> Return to History
            </DsButton>
          </Link>
        </DsCard>
      </div>
    </PageShell>
  );

  const status = order.order_statuses?.description || 'N/A';

  return (
    <PageShell>
      {/* Back link */}
      <Link
        href="/history"
        className="text-neutral-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest flex items-center w-fit"
      >
        <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to History
      </Link>

      {/* Header */}
      <PageHeader
        label={`Order #${order.order_id}`}
        title="ORDER DETAILS"
        subtitle={`Lead time: ${order.leadtime} days`}
        right={
          <DsStatusPill label={status} color={statusColor(status)} />
        }
      />

      {/* Metric cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Application Deadline"
          value={new Date(order.deadline).toLocaleDateString()}
          icon={<Clock className="w-4 h-4" />}
          accent={DS.orange}
        />
        <MetricCard
          label="Upload Deadline"
          value={new Date(order.label_upload_deadline).toLocaleDateString()}
          icon={<Calendar className="w-4 h-4" />}
          accent={DS.yellow}
        />
        {orderCompany && (
          <>
            <MetricCard
              label="Max Commitment"
              value={`$${orderCompany.max_investment.toLocaleString()}`}
              sub={orderCompany.needs_review ? 'Requires Review' : 'Verified'}
              icon={<DollarSign className="w-4 h-4" />}
              accent={DS.teal}
            />
            <MetricCard
              label="Estimated ROI"
              value={orderCompany.roi != null ? `${orderCompany.roi.toFixed(2)}` : '--'}
              sub={orderCompany.roi != null ? undefined : 'Calculated at allocation'}
              icon={<TrendingUp className="w-4 h-4" />}
              accent="#22c55e"
            />
          </>
        )}
      </div>

      {/* Receipts section */}
      <SectionLabel accent={DS.orange}>Proof of Purchase (Receipts)</SectionLabel>

      {receipts.length === 0 ? (
        <DsEmpty
          icon={<FileText className="w-7 h-7" />}
          title="No Receipts"
          body="No receipts have been issued for this order commit yet."
        />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>Filename</DsTh>
            <DsTh>Uploaded At</DsTh>
            <DsTh className="text-right">Actions</DsTh>
          </DsThead>
          <tbody>
            {receipts.map((receipt) => (
              <DsTr key={receipt.receipt_id}>
                <DsTd>
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                    <span className="text-neutral-200 font-medium">{receipt.file_name}</span>
                  </div>
                </DsTd>
                <DsTd>
                  <span className="text-neutral-400">
                    {new Date(receipt.uploaded_at).toLocaleDateString()}
                  </span>
                </DsTd>
                <DsTd className="text-right">
                  <DsButton
                    variant="secondary"
                    onClick={() => handleDownloadReceipt(receipt.file_path)}
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </DsButton>
                </DsTd>
              </DsTr>
            ))}
          </tbody>
        </DsTable>
      )}

      {/* Allocation results section */}
      {allocations.length > 0 && (
        <>
          <SectionLabel accent={DS.teal}>Final Allocations &amp; Distribution</SectionLabel>

          <DsTable>
            <DsThead>
              <DsTh>ASIN</DsTh>
              <DsTh>Qty</DsTh>
              <DsTh className="text-center">Price</DsTh>
              <DsTh>Projected Profit</DsTh>
              <DsTh>Product Info</DsTh>
            </DsThead>
            <tbody>
              {allocations.map((alloc) => {
                const discountedPrice = alloc.discounted_price;
                const originalPrice = alloc.order_products.price;
                const discountPct = discountedPrice != null && originalPrice > 0
                  ? ((originalPrice - discountedPrice) / originalPrice * 100).toFixed(1)
                  : null;

                const profitPositive = alloc.profit != null && alloc.profit >= 0;
                const profitColor = alloc.profit != null
                  ? (profitPositive ? DS.teal : DS.red)
                  : DS.muted;

                return (
                  <DsTr key={`${alloc.order_id}-${alloc.sequence}`}>
                    <DsTd>
                      <span className="font-mono text-neutral-300">{alloc.order_products.asin}</span>
                    </DsTd>
                    <DsTd>
                      <span
                        className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg text-white font-bold text-[11px] border"
                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
                      >
                        {alloc.quantity}
                      </span>
                    </DsTd>
                    <DsTd className="text-center">
                      {discountedPrice != null ? (
                        <div className="flex flex-col items-center">
                          <span className="text-white font-bold">${discountedPrice.toFixed(2)}</span>
                          {discountPct != null && (
                            <span className="text-[9px] font-bold uppercase tracking-tight" style={{ color: DS.teal }}>
                              -{discountPct}% saving
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400">${originalPrice.toFixed(2)}</span>
                      )}
                    </DsTd>
                    <DsTd>
                      <span className="font-mono font-bold" style={{ color: profitColor }}>
                        {alloc.profit != null
                          ? `${profitPositive ? '+' : ''}$${alloc.profit.toFixed(2)}`
                          : '-'}
                      </span>
                    </DsTd>
                    <DsTd>
                      <span className="text-neutral-500 text-[11px] italic truncate block max-w-[200px]">
                        {alloc.order_products.description || 'No additional details available'}
                      </span>
                    </DsTd>
                  </DsTr>
                );
              })}
            </tbody>
          </DsTable>
        </>
      )}
    </PageShell>
  );
}
