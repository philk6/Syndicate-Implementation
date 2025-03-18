'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/orders');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">Group Buy SaaS</h1>
      <p>Redirecting...</p>
    </div>
  );
}