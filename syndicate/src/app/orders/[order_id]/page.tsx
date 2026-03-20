'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { AlertOctagon, Check, CircleDollarSign } from 'lucide-react';
import { debounce } from 'lodash';
import { PageLoadingSpinner } from '@/components/ui/loading-spinner';

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
          // Set default values if balance fetch fails
          setCreditBalance({
            total_balance: 0,
            available_balance: 0,
            held_balance: 0
          });
        }
      } catch (fetchError) {
        console.error("Failed to fetch credit balance:", fetchError);
        // Set default values if balance fetch fails
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

    // Buyers group access check — admins always have access
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
      // First, save the order_company record with max_investment
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

      // Then process the credit hold
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

      // Update order_company with held_amount
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

      // Save product ungated status
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
      fetchData(); // Refresh data to show updated state
    } catch (err: unknown) {
      console.error('Error submitting investment:', err);
      alert(`Failed to submit investment: ${err instanceof Error ? err.message : 'An unknown error occurred'}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [companyId, order, hasSubmitted, isOrderClosed, products, ungatedStatus, ungatedMinAmounts, maxInvestment, investmentError, creditBalance, fetchData]);

  if (loading) {
    return <PageLoadingSpinner />;
  }

  if (!isAuthenticated) return null;
  if (!order) return (
    <div className="min-h-screen p-6 w-full">
      <div className="mx-auto">
        <div className="flex items-center mb-6">
          <Link href="/orders" className="text-amber-500 hover:text-amber-400 mr-4 transition-colors">
            ← Back to Orders
          </Link>
          <h1 className="text-3xl font-bold text-white">Order Not Found</h1>
        </div>
        <p className="text-neutral-400">The requested order does not exist or you don&apos;t have permission to view it.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="w-full">
        {/* Header and Alerts */}
        <div className="flex items-center mb-6">
          <Link href="/orders" className="text-amber-500 hover:text-amber-400 transition-colors mr-4">← Back to Orders</Link>
        </div>
        <div className="flex items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Order #{order.order_id}</h1>
        </div>

        {isOrderClosed && (
          <Alert className='mb-6 bg-rose-500/10 border-rose-500/20 text-rose-400 backdrop-blur-md w-fit'>
            <AlertOctagon className="h-4 w-4" />
            <AlertTitle className="text-rose-300">Closed</AlertTitle>
            <AlertDescription>This order is closed. No further investments can be submitted.</AlertDescription>
          </Alert>
        )}

        {hasSubmitted && !isOrderClosed && (
          <Alert className='mb-6 bg-emerald-500/10 border-emerald-500/20 text-emerald-400 backdrop-blur-md w-fit'>
            <Check className="h-4 w-4" />
            <AlertTitle className="text-emerald-300">Submitted</AlertTitle>
            <AlertDescription>Your application has been submitted. You have <span className="text-white font-semibold">${initialHeldAmount.toLocaleString()}</span> held for this order.</AlertDescription>
          </Alert>
        )}

        {/* Order Details Card */}
        <div className="grid grid-cols-1 gap-6 mb-8 w-full">
          <GlassCard className="p-6">
            <div className="flex flex-wrap gap-8">
              <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Status</span>
                <StatusPill text={order.order_statuses?.description || 'N/A'} type={order.order_statuses?.description || 'N/A'} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Lead Time</span>
                <span className="text-white font-medium">{order.leadtime} days</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Deadline</span>
                <span className="text-white font-medium">{new Date(order.deadline).toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Label Upload Deadline</span>
                <span className="text-white font-medium">{new Date(order.label_upload_deadline).toLocaleString()}</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Products Table */}
        <GlassCard className="p-6 overflow-x-auto">
          {products.length === 0 ? (
            <p className="text-neutral-500">No products found for this order.</p>
          ) : (
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="border-b border-white/[0.05] hover:bg-transparent">
                  <th className="text-neutral-400 w-[15%] h-12 px-4 text-left align-middle font-medium">ASIN</th>
                  <th className="text-neutral-400 w-[15%] h-12 px-4 text-left align-middle font-medium">Ungated?</th>
                  <th className="text-neutral-400 w-[20%] h-12 px-4 text-left align-middle font-medium">Min Ungated Amount</th>
                  <th className="text-neutral-400 w-[15%] h-12 px-4 text-left align-middle font-medium">Price</th>
                  <th className="text-neutral-400 w-[10%] h-12 px-4 text-left align-middle font-medium">Quantity</th>
                  <th className="text-neutral-400 w-[15%] h-12 px-4 text-left align-middle font-medium">ROI (%)</th>
                  {products.some(p => p.description) && (
                    <th className="text-neutral-400 w-[20%] h-12 px-4 text-left align-middle font-medium">Description</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.sequence} className="hover:bg-white/[0.02] transition-colors border-b border-white/[0.02]">
                    <td className="text-neutral-200 p-4 align-middle">{product.asin}</td>
                    <td className="text-neutral-200 p-4 align-middle">
                      <input
                        type="checkbox"
                        checked={ungatedStatus[product.sequence] || false}
                        onChange={(e) => handleUngatedChange(product.sequence, e.target.checked)}
                        className="w-4 h-4 rounded border-white/[0.1] bg-white/[0.03] text-amber-500 focus:ring-amber-500/50"
                        disabled={hasSubmitted || isOrderClosed}
                      />
                    </td>
                    <td className="text-neutral-200 p-4 align-middle">
                      <Input
                        type="number"
                        value={ungatedMinAmounts[product.sequence] || ''}
                        onChange={(e) => handleMinAmountChange(product.sequence, e.target.value)}
                        className="bg-white/[0.02] border-white/[0.05] rounded px-3 py-2 w-full text-white placeholder:text-neutral-600 focus:border-amber-500/50"
                        placeholder="Min Amount"
                        min="0"
                        disabled={!ungatedStatus[product.sequence] || hasSubmitted || isOrderClosed}
                      />
                    </td>
                    <td className="text-neutral-200 p-4 align-middle">
                      {product.hide_price_and_quantity ? '-' : <span className="text-white font-medium">${product.price}</span>}
                    </td>
                    <td className="text-neutral-200 p-4 align-middle">
                      {product.hide_price_and_quantity ? '-' : <span className="text-white">{product.quantity}</span>}
                    </td>
                    <td className="text-neutral-200 p-4 align-middle">
                      {typeof product.roi === 'number' && !product.hide_price_and_quantity ? <span className="text-emerald-400">{product.roi.toFixed(2)}%</span> : '-'}
                    </td>
                    {products.some(p => p.description) && (
                      <td className="text-neutral-400 p-4 align-middle text-sm">{product.description}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassCard>

        {/* Investment Section */}
        <div className="mt-14 flex flex-col items-end">
          <div className="w-full max-w-xs space-y-4">
            <GlassCard className="flex justify-between items-center p-4">
              <div className='flex items-center gap-2'>
                <CircleDollarSign className='h-5 w-5 text-amber-500' />
                <span className="text-neutral-400 font-medium">Available Credit:</span>
              </div>
              <span className="text-lg font-bold text-white">
                ${creditBalance ? creditBalance.available_balance.toLocaleString() : '0'}
              </span>
            </GlassCard>

            {initialHeldAmount > 0 && (
              <p className="text-sm text-neutral-500 text-right">
                You have <span className="text-emerald-400 font-semibold">${initialHeldAmount.toLocaleString()}</span> already held for this order.
              </p>
            )}

            <div>
              <label htmlFor="maxInvestment" className="text-neutral-400 font-medium block mb-2">
                Maximum Investment ($)
              </label>
              <Input
                type="number"
                id="maxInvestment"
                value={maxInvestment || ''}
                onChange={(e) => handleMaxInvestmentChange(e.target.value)}
                className={`bg-white/[0.02] border rounded px-3 py-2 w-full text-white placeholder:text-neutral-600 ${investmentError ? 'border-rose-500 focus:border-rose-500' : 'border-white/[0.05] focus:border-amber-500/50'}`}
                placeholder="Enter amount"
                step="100"
                min="0"
                disabled={hasSubmitted || isOrderClosed || isSubmitting}
              />
              {investmentError && <p className="text-rose-500 text-sm mt-1">{investmentError}</p>}
            </div>

            <Button
              onClick={handleSubmitInvestment}
              className="w-full bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 rounded-xl transition-all duration-300 h-11"
              disabled={hasSubmitted || isOrderClosed || !!investmentError || isSubmitting || maxInvestment === null || maxInvestment === 0}
            >
              <Check className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Submitting...' : 'Submit Investment'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}