'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import Link from 'next/link';
import { AlertOctagon, Check, CircleDollarSign, ArrowLeft, Package, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { debounce } from 'lodash';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';
import {
  DS,
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
  DsInput,
} from '@/components/ui/ds';

// Define the Order type
interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
}

// Product interface for order items
interface OrderProduct {
  sequence: number;
  order_id: number;
  asin: string;
  quantity: number;
  price: number;
  description?: string;
  hide_price_and_quantity: boolean;
  roi: number | null;
}

// Interface for Company Credit Balance
interface CreditBalance {
  total_balance: number;
  available_balance: number;
  held_balance: number;
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

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = parseInt(params.order_id as string);
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [ungatedStatus, setUngatedStatus] = useState<Record<number, boolean>>({});
  const [ungatedMinAmounts, setUngatedMinAmounts] = useState<Record<number, number | null>>({});
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [maxInvestment, setMaxInvestment] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isOrderClosed, setIsOrderClosed] = useState(false);
  const { isAuthenticated, loading: authLoading, user, session } = useAuth();
  const router = useRouter();

  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [investmentError, setInvestmentError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialHeldAmount, setInitialHeldAmount] = useState<number>(0);

  const fetchData = useCallback(async () => {
    if (!user?.user_id || !session) return;
    setLoading(true);

    try {
      // Fetch user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('company_id')
        .eq('user_id', user.user_id)
        .single();

      if (userError || !userData?.company_id) {
        console.error('Error fetching user data:', userError);
        setLoading(false);
        return;
      }
      setCompanyId(userData.company_id);

      // Fetch credit balance with proper error handling
      try {
        const balanceResponse = await fetch('/api/credits/balance', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          setCreditBalance(balanceData);
        } else {
          console.error("Error fetching credit balance:", balanceResponse.status);
          setCreditBalance({
            total_balance: 0,
            available_balance: 0,
            held_balance: 0
          });
        }
      } catch (fetchError) {
        console.error("Failed to fetch credit balance:", fetchError);
        setCreditBalance({
          total_balance: 0,
          available_balance: 0,
          held_balance: 0
        });
      }

      // Fetch order data
      const { data: rawOrderData, error: orderError } = await supabase
        .from('orders')
        .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description)')
        .eq('order_id', orderId)
        .single();

      if (orderError) {
        console.error('Error fetching order:', orderError);
        setLoading(false);
        return;
      }

      // Normalize the order_statuses property
      const orderData = rawOrderData
        ? {
          ...rawOrderData,
          order_statuses: Array.isArray(rawOrderData.order_statuses)
            ? rawOrderData.order_statuses[0]
            : rawOrderData.order_statuses,
        } as Order
        : null;

      setOrder(orderData);
      if (orderData?.order_statuses.description.toLowerCase() === 'closed') {
        setIsOrderClosed(true);
      }

      // Fetch products
      const { data: productData } = await supabase
        .from('order_products')
        .select('sequence, order_id, asin, quantity, price, description, hide_price_and_quantity, roi')
        .eq('order_id', orderId);

      setProducts(productData?.map(p => ({ ...p, roi: typeof p.roi === 'number' ? p.roi : null })) || []);

      // Fetch existing order_company data
      const { data: companyOrderDataArr, error: companyOrderError } = await supabase
        .from('order_company')
        .select('max_investment, held_amount')
        .eq('order_id', orderId)
        .eq('company_id', userData.company_id)
        .limit(1);

      if (!companyOrderError && companyOrderDataArr && companyOrderDataArr.length > 0) {
        const companyOrderData = companyOrderDataArr[0];
        setMaxInvestment(companyOrderData.max_investment);
        setInitialHeldAmount(companyOrderData.held_amount || 0);
        if (companyOrderData.held_amount && companyOrderData.held_amount > 0) {
          setHasSubmitted(true);
        }
      }

      // Fetch ungated status
      const { data: ungatedData } = await supabase
        .from('order_products_company')
        .select('sequence, ungated, ungated_min_amount')
        .eq('order_id', orderId)
        .eq('company_id', userData.company_id);

      if (ungatedData) {
        setUngatedStatus(ungatedData.reduce((acc, item) => ({ ...acc, [item.sequence]: item.ungated }), {}));
        setUngatedMinAmounts(ungatedData.reduce((acc, item) => ({ ...acc, [item.sequence]: item.ungated_min_amount }), {}));
      }

    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setLoading(false);
    }
  }, [orderId, user?.user_id, session]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const hasBuyersGroupAccess = user?.buyersgroup === true || user?.role === 'admin';
    if (!hasBuyersGroupAccess) {
      router.push('/dashboard');
      return;
    }

    if (user?.user_id && session) {
      fetchData();
    }
  }, [isAuthenticated, authLoading, router, user?.user_id, user?.buyersgroup, user?.role, session, fetchData]);

  const updateUngatedStatus = useCallback(async (sequence: number, checked: boolean) => {
    if (!companyId || hasSubmitted || isOrderClosed) return;

    const product = products.find(p => p.sequence === sequence);
    if (!product) return;

    const { error } = await supabase
      .from('order_products_company')
      .upsert({
        order_id: orderId,
        sequence,
        company_id: companyId,
        ungated: checked,
        quantity: product.quantity || 0,
        ungated_min_amount: checked ? ungatedMinAmounts[sequence] : null,
      }, { onConflict: 'order_id, sequence, company_id' });

    if (error) {
      console.error('Error updating ungated status:', error);
    }
  }, [companyId, hasSubmitted, isOrderClosed, products, ungatedMinAmounts, orderId]);

  const debouncedUngatedUpdate = useMemo(() => debounce(updateUngatedStatus, 300), [updateUngatedStatus]);

  const handleUngatedChange = useCallback((sequence: number, checked: boolean) => {
    setUngatedStatus(prev => ({ ...prev, [sequence]: checked }));
    if (!checked) setUngatedMinAmounts(prev => ({ ...prev, [sequence]: null }));
    debouncedUngatedUpdate(sequence, checked);
  }, [debouncedUngatedUpdate]);

  const updateMinAmount = useCallback(async (sequence: number, minAmount: number | null) => {
    if (!companyId || hasSubmitted || isOrderClosed || !ungatedStatus[sequence]) return;

    const product = products.find(p => p.sequence === sequence);
    if (!product) return;

    const { error } = await supabase
      .from('order_products_company')
      .upsert({
        order_id: orderId,
        sequence,
        company_id: companyId,
        ungated: ungatedStatus[sequence],
        quantity: product.quantity || 0,
        ungated_min_amount: minAmount,
      }, { onConflict: 'order_id, sequence, company_id' });

    if (error) {
      console.error('Error updating min amount:', error);
    }
  }, [companyId, hasSubmitted, isOrderClosed, products, ungatedStatus, orderId]);

  const debouncedMinAmountUpdate = useMemo(() => debounce(updateMinAmount, 300), [updateMinAmount]);

  const handleMinAmountChange = useCallback((sequence: number, value: string) => {
    if (!companyId || hasSubmitted || isOrderClosed || !ungatedStatus[sequence]) return;
    const newMinAmount = value ? parseInt(value) : null;
    setUngatedMinAmounts(prev => ({ ...prev, [sequence]: newMinAmount }));
    debouncedMinAmountUpdate(sequence, newMinAmount);
  }, [companyId, hasSubmitted, isOrderClosed, ungatedStatus, debouncedMinAmountUpdate]);

  const handleMaxInvestmentChange = useCallback((value: string) => {
    const numValue = parseFloat(value) || 0;
    setMaxInvestment(numValue);
    const effectiveAvailable = (creditBalance?.available_balance ?? 0) + initialHeldAmount;
    if (numValue > effectiveAvailable) {
      setInvestmentError(`Investment cannot exceed available credit of $${effectiveAvailable.toLocaleString()}.`);
    } else {
      setInvestmentError('');
    }
  }, [creditBalance, initialHeldAmount]);

  const handleSubmitInvestment = useCallback(async () => {
    if (!companyId || !order || hasSubmitted || isOrderClosed || maxInvestment === null || investmentError) {
      alert("Please correct any errors or complete the form before submitting.");
      return;
    }

    if (!creditBalance || creditBalance.available_balance === 0) {
      alert("You have no available credit. Please contact support.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: orderCompanyError } = await supabase
        .from('order_company')
        .upsert({
          order_id: order.order_id,
          company_id: companyId,
          max_investment: maxInvestment
        }, { onConflict: 'order_id, company_id' });

      if (orderCompanyError) {
        alert(`Failed to save investment: ${orderCompanyError.message}`);
        setIsSubmitting(false);
        return;
      }

      const { error: holdError } = await supabase.rpc('process_order_hold', {
        p_company_id: companyId,
        p_order_id: order.order_id,
        p_hold_amount: maxInvestment
      });

      if (holdError) {
        alert(`Failed to place credit hold: ${holdError.message}`);
        setIsSubmitting(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('order_company')
        .update({
          held_amount: maxInvestment
        })
        .eq('order_id', order.order_id)
        .eq('company_id', companyId);

      if (updateError) {
        console.error('Error updating held_amount:', updateError);
      }

      const investmentData = products.map(product => ({
        order_id: order.order_id,
        sequence: product.sequence,
        company_id: companyId,
        quantity: product.quantity,
        ungated: ungatedStatus[product.sequence] || false,
        ungated_min_amount: ungatedStatus[product.sequence] ? ungatedMinAmounts[product.sequence] : null,
      }));

      const { error: productsError } = await supabase
        .from('order_products_company')
        .upsert(investmentData, { onConflict: 'order_id, sequence, company_id' });

      if (productsError) {
        console.error('Error saving product selections:', productsError);
      }

      alert('Investment submitted successfully!');
      setHasSubmitted(true);
      fetchData();
    } catch (err: unknown) {
      console.error('Error submitting investment:', err);
      alert(`Failed to submit investment: ${err instanceof Error ? err.message : 'An unknown error occurred'}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [companyId, order, hasSubmitted, isOrderClosed, products, ungatedStatus, ungatedMinAmounts, maxInvestment, investmentError, creditBalance, fetchData]);

  // ── Computed values for metrics ───────────────────────────────────────────
  const avgRoi = useMemo(() => {
    const roiProducts = products.filter(p => typeof p.roi === 'number' && !p.hide_price_and_quantity);
    if (roiProducts.length === 0) return null;
    return roiProducts.reduce((sum, p) => sum + (p.roi ?? 0), 0) / roiProducts.length;
  }, [products]);

  const totalValue = useMemo(() => {
    return products
      .filter(p => !p.hide_price_and_quantity)
      .reduce((sum, p) => sum + (p.price * p.quantity), 0);
  }, [products]);

  const hasDescriptionColumn = useMemo(() => products.some(p => p.description), [products]);

  if (loading) {
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated) return null;

  if (!order) {
    return (
      <PageShell>
        <PageHeader title="ORDER NOT FOUND" accent={DS.red} />
        <DsCard className="p-8 text-center">
          <p className="text-neutral-400 mb-4">
            The requested order does not exist or you don&apos;t have permission to view it.
          </p>
          <Link href="/orders">
            <DsButton variant="secondary" accent={DS.orange}>
              <ArrowLeft size={14} />
              Back to Orders
            </DsButton>
          </Link>
        </DsCard>
      </PageShell>
    );
  }

  const stColor = statusColor(order.order_statuses?.description);

  return (
    <PageShell>
      {/* Navigation */}
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest transition-colors"
        style={{ color: DS.orange }}
      >
        <ArrowLeft size={14} />
        Back to Orders
      </Link>

      {/* Header */}
      <PageHeader
        label={`Order #${order.order_id}`}
        title={`ORDER #${order.order_id}`}
        accent={DS.orange}
        right={
          <DsStatusPill
            label={order.order_statuses?.description || 'N/A'}
            color={stColor}
          />
        }
      />

      {/* Alerts */}
      {isOrderClosed && (
        <DsCard accent={DS.red} glow className="p-4 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${DS.red}1a`, borderColor: `${DS.red}55`, color: DS.red }}
          >
            <AlertOctagon size={16} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: DS.red }}>Order Closed</p>
            <p className="text-xs text-neutral-400">This order is closed. No further investments can be submitted.</p>
          </div>
        </DsCard>
      )}

      {hasSubmitted && !isOrderClosed && (
        <DsCard accent={DS.teal} glow className="p-4 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${DS.teal}1a`, borderColor: `${DS.teal}55`, color: DS.teal }}
          >
            <Check size={16} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: DS.teal }}>Investment Submitted</p>
            <p className="text-xs text-neutral-400">
              Your application has been submitted. You have{' '}
              <span className="text-white font-semibold">${initialHeldAmount.toLocaleString()}</span>{' '}
              held for this order.
            </p>
          </div>
        </DsCard>
      )}

      {/* Order Details Metrics */}
      <SectionLabel accent={DS.orange}>Order Details</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Lead Time"
          value={`${order.leadtime}d`}
          accent={DS.orange}
          icon={<Clock size={16} />}
        />
        <MetricCard
          label="App Deadline"
          value={new Date(order.deadline).toLocaleDateString()}
          sub={new Date(order.deadline).toLocaleTimeString()}
          accent={DS.gold}
          icon={<Clock size={16} />}
        />
        <MetricCard
          label="Label Deadline"
          value={new Date(order.label_upload_deadline).toLocaleDateString()}
          sub={new Date(order.label_upload_deadline).toLocaleTimeString()}
          accent={DS.gold}
          icon={<Clock size={16} />}
        />
        <MetricCard
          label="Products"
          value={products.length}
          accent={DS.teal}
          icon={<Package size={16} />}
        />
      </div>

      {/* ROI / Investment Metrics */}
      {(avgRoi !== null || totalValue > 0) && (
        <>
          <SectionLabel accent={DS.teal}>Investment Metrics</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {avgRoi !== null && (
              <MetricCard
                label="Avg ROI"
                value={`${avgRoi.toFixed(1)}%`}
                accent={DS.teal}
                icon={<TrendingUp size={16} />}
              />
            )}
            {totalValue > 0 && (
              <MetricCard
                label="Total Order Value"
                value={`$${totalValue.toLocaleString()}`}
                accent={DS.gold}
                icon={<DollarSign size={16} />}
              />
            )}
            {creditBalance && (
              <MetricCard
                label="Available Credit"
                value={`$${creditBalance.available_balance.toLocaleString()}`}
                accent={DS.orange}
                icon={<CircleDollarSign size={16} />}
              />
            )}
          </div>
        </>
      )}

      {/* Products Table */}
      <SectionLabel accent={DS.orange}>Products</SectionLabel>
      {products.length === 0 ? (
        <DsEmpty
          icon={<Package size={28} />}
          title="No Products"
          body="No products found for this order."
        />
      ) : (
        <DsTable>
          <DsThead>
            <DsTh>ASIN</DsTh>
            <DsTh>Ungated?</DsTh>
            <DsTh>Min Ungated Amt</DsTh>
            <DsTh>Price</DsTh>
            <DsTh>Qty</DsTh>
            <DsTh>ROI (%)</DsTh>
            {hasDescriptionColumn && <DsTh>Description</DsTh>}
          </DsThead>
          <tbody>
            {products.map((product) => (
              <DsTr key={product.sequence}>
                <DsTd className="font-bold">
                  <span style={{ color: DS.orange }}>{product.asin}</span>
                </DsTd>
                <DsTd>
                  <input
                    type="checkbox"
                    checked={ungatedStatus[product.sequence] || false}
                    onChange={(e) => handleUngatedChange(product.sequence, e.target.checked)}
                    className="w-4 h-4 rounded border-white/[0.1] bg-white/[0.03] accent-orange-500"
                    disabled={hasSubmitted || isOrderClosed}
                  />
                </DsTd>
                <DsTd>
                  <input
                    type="number"
                    value={ungatedMinAmounts[product.sequence] || ''}
                    onChange={(e) => handleMinAmountChange(product.sequence, e.target.value)}
                    className="w-full text-xs text-white border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#FF6B3566] placeholder-neutral-600"
                    style={{ backgroundColor: DS.inputBg, borderColor: 'rgba(255,255,255,0.1)' }}
                    placeholder="Min Amt"
                    min="0"
                    disabled={!ungatedStatus[product.sequence] || hasSubmitted || isOrderClosed}
                  />
                </DsTd>
                <DsTd>
                  {product.hide_price_and_quantity
                    ? <span className="text-neutral-600">--</span>
                    : <span className="text-white font-medium">${product.price}</span>
                  }
                </DsTd>
                <DsTd>
                  {product.hide_price_and_quantity
                    ? <span className="text-neutral-600">--</span>
                    : <span className="text-white">{product.quantity}</span>
                  }
                </DsTd>
                <DsTd>
                  {typeof product.roi === 'number' && !product.hide_price_and_quantity
                    ? <span style={{ color: DS.teal }} className="font-bold">{product.roi.toFixed(2)}%</span>
                    : <span className="text-neutral-600">--</span>
                  }
                </DsTd>
                {hasDescriptionColumn && (
                  <DsTd className="text-neutral-400 text-[11px]">{product.description}</DsTd>
                )}
              </DsTr>
            ))}
          </tbody>
        </DsTable>
      )}

      {/* Investment Section */}
      <SectionLabel accent={DS.gold}>Submit Investment</SectionLabel>
      <div className="flex justify-end">
        <div className="w-full max-w-sm space-y-4">
          {initialHeldAmount > 0 && (
            <DsCard className="p-3 text-right">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">Currently Held</span>
              <p className="text-lg font-black" style={{ color: DS.teal }}>
                ${initialHeldAmount.toLocaleString()}
              </p>
            </DsCard>
          )}

          <DsInput
            label="Maximum Investment ($)"
            type="number"
            value={maxInvestment?.toString() || ''}
            onChange={handleMaxInvestmentChange}
            placeholder="Enter amount"
          />
          {investmentError && (
            <p className="text-xs font-bold" style={{ color: DS.red }}>{investmentError}</p>
          )}

          <DsButton
            onClick={handleSubmitInvestment}
            variant="primary"
            accent={DS.orange}
            disabled={hasSubmitted || isOrderClosed || !!investmentError || isSubmitting || maxInvestment === null || maxInvestment === 0}
            className="w-full"
          >
            <Check size={14} />
            {isSubmitting ? 'Submitting...' : 'Submit Investment'}
          </DsButton>
        </div>
      </div>
    </PageShell>
  );
}
