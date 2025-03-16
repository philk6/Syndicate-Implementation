'use client'; // Client component for useEffect

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function Home() {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatuses() {
      const { data, error } = await supabase.from('order_statuses').select('*');
      if (error) {
        console.error('Error fetching statuses:', error);
      } else {
        setStatuses(data);
      }
      setLoading(false);
    }
    fetchStatuses();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">Group Buy SaaS</h1>
      <p className="mb-4">A platform for Amazon FBA/FBM sellers to buy together.</p>
      <div>
        <h2 className="text-xl font-semibold mb-2">Order Statuses</h2>
        {loading ? (
          <p>Loading...</p>
        ) : statuses.length > 0 ? (
          <ul className="list-disc pl-5">
            {statuses.map((status) => (
              <li key={status.order_status_id}>{status.description}</li>
            ))}
          </ul>
        ) : (
          <p>No statuses yet. Add some in Supabase!</p>
        )}
      </div>
    </div>
  );
}