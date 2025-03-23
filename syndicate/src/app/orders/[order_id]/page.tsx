'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { supabase } from '../../../../lib/supabase';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

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
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = parseInt(params.order_id as string); // Type assertion to ensure order_id is treated as string
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [ungatedStatus, setUngatedStatus] = useState<Record<number, boolean>>({});
  const [companyId, setCompanyId] = useState<number | null>(null);
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

      if (userError) {
        console.error('Error fetching user data:', userError);
        setLoading(false);
        return;
      }
      setCompanyId(userData.company_id);

      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description)')
        .eq('order_id', orderId)
        .single() as { data: Order | null, error: PostgrestError | null };

      if (orderError) {
        console.error('Error fetching order:', orderError);
        setLoading(false);
        return;
      }

      // Fetch order products
      const { data: productData, error: productError } = await supabase
        .from('order_products')
        .select('sequence, order_id, asin, quantity, price, description')
        .eq('order_id', orderId);

      if (productError) {
        console.error('Error fetching order products:', productError);
      }

      // Fetch existing max_investment from order_company
      if (userData.company_id) {
        const { data: companyOrderData, error: companyOrderError } = await supabase
          .from('order_company')
          .select('max_investment')
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id)
          .single();

        if (companyOrderError && companyOrderError.code !== 'PGRST116') { // PGRST116 is "no rows"
          console.error('Error fetching order company data:', companyOrderError);
        } else if (companyOrderData) {
          setMaxInvestment(companyOrderData.max_investment);
        }
      }

      // Fetch existing ungated status for this company
      if (userData.company_id) {
        const { data: ungatedData, error: ungatedError } = await supabase
          .from('order_products_company')
          .select('sequence, ungated')
          .eq('order_id', orderId)
          .eq('company_id', userData.company_id);

        if (ungatedError) {
          console.error('Error fetching ungated status:', ungatedError);
        } else {
          const ungatedMap = ungatedData?.reduce((acc, item) => {
            acc[item.sequence] = item.ungated;
            return acc;
          }, {} as Record<number, boolean>);
          setUngatedStatus(ungatedMap || {});
        }
      }

      setOrder(orderData);
      setProducts(productData || []);
      setLoading(false);
    }

    fetchData();
  }, [orderId, isAuthenticated, authLoading, router, user]);

  const handleUngatedChange = async (sequence: number, checked: boolean) => {
    if (!companyId) return;

    setUngatedStatus(prev => ({ ...prev, [sequence]: checked }));

    const { error } = await supabase
      .from('order_products_company')
      .upsert({
        order_id: orderId,
        sequence,
        company_id: companyId,
        ungated: checked,
        quantity: products.find(p => p.sequence === sequence)?.quantity || 0
      }, {
        onConflict: 'order_id, sequence, company_id'
      });

    if (error) {
      console.error('Error updating ungated status:', error);
      setUngatedStatus(prev => ({ ...prev, [sequence]: !checked }));
    }
  };

  const handleMaxInvestmentChange = async (value: string) => {
    if (!companyId) return;

    const newMaxInvestment = parseFloat(value) || 0;
    setMaxInvestment(newMaxInvestment);

    const { error } = await supabase
      .from('order_company')
      .upsert({
        order_id: orderId,
        company_id: companyId,
        max_investment: newMaxInvestment
      }, {
        onConflict: 'order_id, company_id'
      });

    if (error) {
      console.error('Error updating max investment:', error);
      setMaxInvestment(null); // Revert on error
    }
  };

  const handleSubmitInvestment = async () => {
    if (!companyId || !order) return;
  
    try {
      // Prepare the data for order_products_company
      const investmentData = products.map(product => ({
        order_id: order.order_id,
        sequence: product.sequence,
        company_id: companyId,
        quantity: product.quantity,
        ungated: ungatedStatus[product.sequence] || false
      }));
  
      // Insert/update all records at once
      const { error } = await supabase
        .from('order_products_company')
        .upsert(investmentData, {
          onConflict: 'order_id, sequence, company_id'
        });
  
      if (error) {
        console.error('Error submitting investment:', error);
        alert('Failed to submit investment. Please try again.');
        return;
      }
  
      alert('Investment submitted successfully!');
      // Optionally redirect or refresh the page
      // router.push('/orders');
    } catch (err) {
      console.error('Unexpected error:', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  if (authLoading || loading) {
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
          <Link href="/orders" className="text-blue-500 hover:text-blue-400 mr-4">
            ← Back to Orders
          </Link>
          <h1 className="text-3xl font-bold text-white">Order Not Found</h1>
        </div>
        <p className="text-gray-400">The requested order does not exist or you don&apos;t have permission to view it.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <div className="flex items-center mb-6">
          <Link href="/orders" className="text-[#c8aa64] hover:text-[#9d864e] mr-4">
            ← Back to Orders
          </Link>
        </div>

        <div className="flex items-center mb-6">
          <h1 className="text-3xl font-bold text-[#bfbfbf]">Order #{order.order_id}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#191813] rounded-lg p-6 border border-[#2b2b2b]">
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

        <div className="bg-[#191813] rounded-lg p-6 border border-[#2b2b2b]">
          {products.length === 0 ? (
            <p className="text-gray-400">No products found for this order.</p>
          ) : (
            <Table className="bg-[#191813]">
              <TableHeader>
                <TableRow className="border-[#2B2B2B] hover:bg-[#191813]">
                  <TableHead className="text-gray-300">ASIN</TableHead>
                  <TableHead className="text-gray-300">Ungated?</TableHead>
                  <TableHead className="text-gray-300">Price</TableHead>
                  <TableHead className="text-gray-300">Quantity</TableHead>
                  {products[0].description && <TableHead className="text-gray-300">Description</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.sequence} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                    <TableCell className="text-gray-200">{product.asin}</TableCell>
                    <TableCell className="text-gray-200">
                      <input
                        type="checkbox"
                        checked={ungatedStatus[product.sequence] || false}
                        onChange={(e) => handleUngatedChange(product.sequence, e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded"
                      />
                    </TableCell>
                    <TableCell className="text-gray-200">${product.price}</TableCell>
                    <TableCell className="text-gray-200">{product.quantity}</TableCell>
                    {product.description && <TableCell className="text-gray-200">{product.description}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="mb-4 flex flex-col items-end mt-14">
          <label htmlFor="maxInvestment" className="text-gray-300 font-medium block mb-2">
            Maximum Investment ($)
          </label>
          <input
            type="number"
            id="maxInvestment"
            value={maxInvestment || ''}
            onChange={(e) => handleMaxInvestmentChange(e.target.value)}
            className="bg-[#1f1f1f] text-gray-300 border border-[#6a6a6a80] rounded px-3 py-2 w-full max-w-xs"
            step="100"
            min="1000"
          />
          <Button
            onClick={handleSubmitInvestment}
            className="mt-10 bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
          >
            <Check className="mr-2 h-4 w-4" />
            Submit Investment
          </Button>
        </div>
      </div>
    </div>
  );
}