'use client';

import { useState, useEffect } from 'react';
import { OrderProduct } from '../../../lib/types';

export default function TestDatabasePage() {
  const [data, setData] = useState<OrderProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/test-db');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch data');
        }
        
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Database Connection Test</h1>
      
      {loading && <p className="text-gray-500">Loading data...</p>}
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p><strong>Error:</strong> {error}</p>
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