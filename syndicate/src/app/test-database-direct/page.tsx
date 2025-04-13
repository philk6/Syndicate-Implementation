'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@lib/supabase/client';
import { OrderProduct } from '@lib/types';

export default function TestDatabaseDirectPage() {
  const [data, setData] = useState<OrderProduct[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: fetchedData, error: fetchError } = await supabase
        .from('order_products')
        .select('*')
        .returns<OrderProduct[]>();

      if (fetchError) {
        setError(fetchError);
      } else {
        setData(fetchedData);
      }
      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Direct Database Connection Test</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p><strong>Error:</strong> {error.message}</p>
        </div>
      )}

      {data && (
        <div>
          <p className="text-green-600 font-semibold mb-2">
            ✓ Database connection successful!
          </p>
          <p className="mb-4">Retrieved {data.length} records from the order_products table.</p>

          <div className="bg-gray-100 p-4 rounded overflow-auto">
            <pre className="text-sm">{JSON.stringify(data, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
} 