'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth';
import { supabase } from '../../../../lib/supabase';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Define the Order type with more complete information
interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string }[];
  // Add more fields as needed
}

// Product interface for order items
interface OrderProduct {
  id?: number;
  sequence?: number;
  order_id: number;
  product_id?: number;
  asin?: string;
  quantity: number;
  price: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export default function OrderDetailPage({ params }: { params: { order_id: string } }) {
  const orderId = parseInt(params.order_id);
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return; // Wait until auth check completes

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    async function fetchOrderData() {
      setLoading(true);

      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description)')
        .eq('order_id', orderId)
        .single();

      if (orderError) {
        console.error('Error fetching order:', orderError);
        setLoading(false);
        return;
      }

      // Fetch order products
      const { data: productData, error: productError } = await supabase
        .from('order_products')
        .select('*')
        .eq('order_id', orderId);

      if (productError) {
        console.error('Error fetching order products:', productError);
      }

      setOrder(orderData);
      setProducts(productData || []);
      setLoading(false);
    }

    fetchOrderData();
  }, [orderId, isAuthenticated, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex items-center justify-center">
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
            &larr; Back to Orders
          </Link>
          <h1 className="text-3xl font-bold text-white">Order Not Found</h1>
        </div>
        <p className="text-gray-400">The requested order does not exist or you don't have permission to view it.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto">
        <div className="flex items-center mb-6">
          <Link href="/orders" className="text-[#c8aa64] hover:text-[#9d864e] mr-4">
            &larr; Back to Orders
          </Link>
        </div>

        <div className="flex items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Order #{order.order_id}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#18181A] rounded-lg p-6">
            <div className="flex flex-wrap gap-6 text-gray-300">
              <div className="flex flex-col">
                <span className="font-medium">Status</span>
                <span>{order.order_statuses[0]?.description || 'N/A'}</span>
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

        <div className="bg-[#18181A] rounded-lg p-6">
          {/* <h2 className="text-xl font-semibold text-white mb-4">Order Products</h2> */}
          {products.length === 0 ? (
            <p className="text-gray-400">No products found for this order.</p>
          ) : (
            <Table className='bg-[#18181A]'>
              <TableHeader>
                <TableRow className="border-[#6a6a6a80] hover:bg-[#18181A]">
                  {products[0].asin && <TableHead className="text-gray-300">ASIN</TableHead>}
                  {products[0].sequence && <TableHead className="text-gray-300">Sequence</TableHead>}
                  <TableHead className="text-gray-300">Price</TableHead>
                  <TableHead className="text-gray-300">Quantity</TableHead>
                  {products[0].description && <TableHead className="text-gray-300">Description</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product, index) => (
                  <TableRow key={index} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                    {product.asin && <TableCell className="text-gray-200">{product.asin}</TableCell>}
                    {product.sequence && <TableCell className="text-gray-200">{product.sequence}</TableCell>}
                    <TableCell className="text-gray-200">${product.price}</TableCell>
                    <TableCell className="text-gray-200">{product.quantity}</TableCell>
                    {product.description && <TableCell className="text-gray-200">{product.description}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
} 