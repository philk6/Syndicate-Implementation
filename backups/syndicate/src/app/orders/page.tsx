'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [maxInvestment, setMaxInvestment] = useState('');
  const [ungated, setUngated] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    async function fetchOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('order_id, deadline, order_statuses(description)')
        .eq('order_statuses.description', 'Open')
        .gt('deadline', new Date().toISOString());
      if (error) console.error(error);
      setOrders(data || []);
    }
    fetchOrders();
  }, [router]);

  useEffect(() => {
    if (selectedOrder) {
      async function fetchProducts() {
        const { data } = await supabase
          .from('order_products')
          .select('sequence, asin, price, quantity, description')
          .eq('order_id', selectedOrder);
        setProducts(data || []);
      }
      fetchProducts();
    }
  }, [selectedOrder]);

  const handleApply = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    const { error: orderError } = await supabase.from('order_company').insert({
      order_id: selectedOrder,
      company_id: 1, // Replace with user’s company_id later
      max_investment: Number(maxInvestment),
    });
    if (orderError) {
      alert(orderError.message);
      return;
    }
    const applications = products.map((product) => ({
      order_id: selectedOrder,
      sequence: product.sequence,
      company_id: 1,
      quantity: product.quantity,
      ungated: ungated[product.sequence] || false,
    }));
    const { error } = await supabase.from('order_products_company').insert(applications);
    if (error) alert(error.message);
    else alert('Application submitted!');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-blue-600">Available Orders</h1>
        <button
          onClick={handleLogout}
          className="p-2 bg-red-600 text-white rounded hover:bg-red-700 transition duration-200"
        >
          Logout
        </button>
      </div>
      <select
        onChange={(e) => setSelectedOrder(Number(e.target.value))}
        className="w-full p-2 border rounded mb-4"
      >
        <option value="">Select an Order</option>
        {orders.map((order) => (
          <option key={order.order_id} value={order.order_id}>
            Order #{order.order_id} - Deadline: {new Date(order.deadline).toLocaleString()}
          </option>
        ))}
      </select>
      {selectedOrder && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Products</h2>
          {products.map((product) => (
            <div key={product.sequence} className="p-4 border rounded">
              <p>ASIN: {product.asin}</p>
              <p>Price: ${product.price}</p>
              <p>Quantity: {product.quantity}</p>
              <p>{product.description}</p>
              <label className="flex items-center mt-2">
                <input
                  type="checkbox"
                  checked={ungated[product.sequence] || false}
                  onChange={(e) =>
                    setUngated({ ...ungated, [product.sequence]: e.target.checked })
                  }
                  className="mr-2"
                />
                Ungated
              </label>
            </div>
          ))}
          <div>
            <label className="block mb-1">Max Investment ($)</label>
            <input
              type="number"
              value={maxInvestment}
              onChange={(e) => setMaxInvestment(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          <button
            onClick={handleApply}
            className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Apply for Order
          </button>
        </div>
      )}
    </div>
  );
}